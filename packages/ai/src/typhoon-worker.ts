/**
 * worker_threads runner for Typhoon window inference.
 *
 * Feature extraction and greedy decode run long and block the event loop, so
 * each window runs in a Worker. The provider keeps one Worker for the whole
 * call, so the ONNX sessions load once and stay warm across windows. When the
 * worker file is not shipped next to the running bundle, the runner falls back
 * to the in-process engine and logs one warning.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, Worker, type Transferable } from "node:worker_threads";
import { messageOf } from "./process.ts";
import { createTyphoonEngine, type TyphoonEngine } from "./typhoon-engine.ts";
import { AiError, type SpokenWord } from "./types.ts";

export type WindowTask = {
  modelDir: string;
  samples: Float32Array;
  windowIndex: number;
};

export type WorkerMessage =
  | { type: "progress"; fraction: number }
  | { type: "result"; words: SpokenWord[] }
  | { type: "error"; message: string };

export type WorkerHandle = {
  postMessage(message: WindowTask, transferList?: Transferable[]): void;
  on(event: "message" | "error" | "exit", listener: (value: unknown) => void): void;
  terminate(): Promise<number>;
};

export type WorkerSpawn = (workerPath: string) => WorkerHandle;

export type WindowWorker = {
  run(
    samples: Float32Array,
    windowIndex: number,
    onProgress: (fraction: number) => void,
  ): Promise<SpokenWord[]>;
  terminate(): Promise<void>;
  /** "worker" runs a Worker thread; "in-process" is the fallback. */
  readonly mode: "worker" | "in-process";
};

/** Builds the per-call worker for a model directory. */
export type RunWindow = (modelDir: string) => WindowWorker;

export type ResolveWorkerFileInput = {
  metaUrl: string;
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  exists: (filePath: string) => boolean;
};

const WORKER_FILE = "typhoon-worker.ts";
const WORKER_SUBPATH = path.join("packages", "ai", "src", WORKER_FILE);

/**
 * Finds the worker entry, in order: next to the module URL, then up from the
 * working directory, then the VERBAL_TYPHOON_WORKER override. Returns the
 * absolute path, or undefined when nothing resolves.
 */
export function resolveWorkerFile(input: ResolveWorkerFileInput): string | undefined {
  try {
    const url = new URL(`./${WORKER_FILE}`, input.metaUrl);
    if (url.protocol === "file:") {
      const filePath = fileURLToPath(url);
      if (input.exists(filePath)) {
        return filePath;
      }
    }
  } catch {
    // The bundle may rewrite import.meta.url to a non-file URL.
  }

  let dir = input.cwd;
  for (let level = 0; level <= 5; level += 1) {
    const candidate = path.join(dir, WORKER_SUBPATH);
    if (input.exists(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  const override = input.env.VERBAL_TYPHOON_WORKER;
  if (override !== undefined && override.trim() !== "" && input.exists(override)) {
    return override;
  }

  return undefined;
}

const ENCODER_FILE = "encoder.onnx";
const DECODER_FILE = "decoder.onnx";
const VOCAB_FILE = "vocab.json";

let warnedOnce = false;

function readVocab(modelDir: string): string[] {
  const raw = readFileSync(path.join(modelDir, VOCAB_FILE), "utf8");
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error("the Typhoon vocabulary is not a string array");
  }
  return value;
}

function buildEngine(modelDir: string): TyphoonEngine {
  return createTyphoonEngine({
    encoderPath: path.join(modelDir, ENCODER_FILE),
    decoderPath: path.join(modelDir, DECODER_FILE),
    vocab: readVocab(modelDir),
  });
}

/** Runs each window through an already-built engine on the calling thread. */
export function createInProcessWindowWorker(engine: TyphoonEngine): WindowWorker {
  return {
    mode: "in-process",
    async run(samples, _windowIndex, onProgress) {
      const result = await engine.transcribe(samples, { onProgress });
      return result.words;
    },
    async terminate() {},
  };
}

const defaultSpawn: WorkerSpawn = (workerPath) => new Worker(workerPath);

/**
 * Builds a per-call window runner. Spawns one Worker and reuses it, so the
 * model sessions load once. Falls back to the in-process engine when the
 * worker entry is not loadable (for example a bundle that does not ship it).
 */
export function createWindowWorker(
  modelDir: string,
  options: { spawn?: WorkerSpawn } = {},
): WindowWorker {
  const workerPath = resolveWorkerFile({
    metaUrl: import.meta.url,
    cwd: process.cwd(),
    env: process.env,
    exists: existsSync,
  });

  if (workerPath === undefined) {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn(
        "the Typhoon worker file is not available in this bundle; running windows in-process",
      );
    }
    return createInProcessWindowWorker(buildEngine(modelDir));
  }

  const handle = (options.spawn ?? defaultSpawn)(workerPath);

  type Pending = {
    resolve: (words: SpokenWord[]) => void;
    reject: (error: Error) => void;
    onProgress: (fraction: number) => void;
  };
  let pending: Pending | undefined;

  const fail = (error: Error): void => {
    if (pending !== undefined) {
      const current = pending;
      pending = undefined;
      current.reject(error);
    }
  };

  handle.on("message", (value) => {
    const message = value as WorkerMessage;
    if (message.type === "progress") {
      pending?.onProgress(message.fraction);
    } else if (message.type === "result") {
      if (pending !== undefined) {
        const current = pending;
        pending = undefined;
        current.resolve(message.words);
      }
    } else if (message.type === "error") {
      fail(new AiError("request-failed", message.message));
    }
  });
  handle.on("error", (value) => {
    fail(new AiError("request-failed", messageOf(value)));
  });
  handle.on("exit", () => {
    fail(new AiError("request-failed", "the Typhoon worker stopped"));
  });

  return {
    mode: "worker",
    run(samples, windowIndex, onProgress) {
      return new Promise<SpokenWord[]>((resolve, reject) => {
        pending = { resolve, reject, onProgress };
        handle.postMessage({ modelDir, samples, windowIndex }, [samples.buffer as ArrayBuffer]);
      });
    },
    async terminate() {
      fail(new AiError("request-failed", "transcription cancelled"));
      await handle.terminate();
    },
  };
}

if (!isMainThread) {
  const engines = new Map<string, TyphoonEngine>();

  parentPort?.on("message", (task: WindowTask) => {
    void (async () => {
      try {
        let engine = engines.get(task.modelDir);
        if (engine === undefined) {
          engine = buildEngine(task.modelDir);
          engines.set(task.modelDir, engine);
        }
        const result = await engine.transcribe(task.samples, {
          onProgress: (fraction) => {
            parentPort?.postMessage({ type: "progress", fraction });
          },
        });
        parentPort?.postMessage({ type: "result", words: result.words });
      } catch (error) {
        parentPort?.postMessage({ type: "error", message: messageOf(error) });
      }
    })();
  });
}
