import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { decodeWavPcm16 } from "./typhoon";
import {
  createWindowWorker,
  resolveWorkerFile,
  type WorkerHandle,
  type WorkerMessage,
  type WindowTask,
} from "./typhoon-worker";

function fakeWorker() {
  const listeners = new Map<string, ((value: unknown) => void)[]>();
  const tasks: WindowTask[] = [];
  const terminate = vi.fn(async () => 0);
  const worker: WorkerHandle = {
    postMessage(message: WindowTask) {
      tasks.push(message);
    },
    on(event, listener) {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
    },
    terminate,
  };
  return {
    worker,
    tasks,
    terminate,
    emit(message: WorkerMessage) {
      for (const listener of listeners.get("message") ?? []) {
        listener(message);
      }
    },
    emitError(error: Error) {
      for (const listener of listeners.get("error") ?? []) {
        listener(error);
      }
    },
    emitExit(code: number) {
      for (const listener of listeners.get("exit") ?? []) {
        listener(code);
      }
    },
  };
}

describe("createWindowWorker", () => {
  it("maps a worker error message to an AiError", async () => {
    const { worker, emit } = fakeWorker();
    const runner = createWindowWorker("/models/typhoon", { spawn: () => worker });

    expect(runner.mode).toBe("worker");
    const runPromise = runner.run(new Float32Array([0.1, 0.2]), 0, () => {});
    emit({ type: "error", message: "the decoder failed" });

    await expect(runPromise).rejects.toMatchObject({
      code: "request-failed",
      message: "the decoder failed",
    });
  });
});

describe("resolveWorkerFile", () => {
  const SUB = path.join("packages", "ai", "src", "typhoon-worker.ts");
  const at = (base: string): string => path.join(base, SUB);

  it("resolves next to a file metaUrl first", () => {
    const metaUrl = pathToFileURL("/repo/apps/web/dist/server/entry.js").href;
    const expected = path.join("/repo/apps/web/dist/server", "typhoon-worker.ts");
    const exists = (p: string): boolean => p === expected || p === at("/repo");

    expect(resolveWorkerFile({ metaUrl, cwd: "/repo/apps/web", env: {}, exists })).toBe(expected);
  });

  it("walks up from cwd to find packages/ai/src", () => {
    const expected = at("/repo");
    const exists = (p: string): boolean => p === expected;

    expect(
      resolveWorkerFile({
        metaUrl: "data:text/javascript,",
        cwd: "/repo/apps/web",
        env: {},
        exists,
      }),
    ).toBe(expected);
  });

  it("uses the VERBAL_TYPHOON_WORKER override", () => {
    const override = "/custom/typhoon-worker.ts";
    const exists = (p: string): boolean => p === override;

    expect(
      resolveWorkerFile({
        metaUrl: "data:text/javascript,",
        cwd: "/repo/apps/web",
        env: { VERBAL_TYPHOON_WORKER: override },
        exists,
      }),
    ).toBe(override);
  });

  it("prefers the cwd walk over the env override", () => {
    const expected = at("/repo");
    const override = "/custom/typhoon-worker.ts";
    const exists = (p: string): boolean => p === expected || p === override;

    expect(
      resolveWorkerFile({
        metaUrl: "data:text/javascript,",
        cwd: "/repo/apps/web",
        env: { VERBAL_TYPHOON_WORKER: override },
        exists,
      }),
    ).toBe(expected);
  });

  it("prefers the metaUrl over the cwd walk", () => {
    const metaUrl = pathToFileURL("/repo/apps/web/dist/server/entry.js").href;
    const expected = path.join("/repo/apps/web/dist/server", "typhoon-worker.ts");
    const exists = (p: string): boolean => p === expected || p === at("/repo");

    expect(resolveWorkerFile({ metaUrl, cwd: "/repo/apps/web", env: {}, exists })).toBe(expected);
  });

  it("finds a worker five parents up but not six", () => {
    const cwd = "/a/b/c/d/e/f/repo";
    const atFive = at("/a/b");
    const atSix = at("/a");

    expect(
      resolveWorkerFile({ metaUrl: "data:", cwd, env: {}, exists: (p) => p === atSix }),
    ).toBeUndefined();
    expect(
      resolveWorkerFile({ metaUrl: "data:", cwd, env: {}, exists: (p) => p === atFive }),
    ).toBe(atFive);
  });

  it("returns undefined when nothing resolves", () => {
    expect(
      resolveWorkerFile({
        metaUrl: "data:text/javascript,",
        cwd: "/repo/apps/web",
        env: {},
        exists: () => false,
      }),
    ).toBeUndefined();
  });
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL_DIR =
  process.env.VERBAL_TYPHOON_MODEL ??
  path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "verbal",
    "models",
    "typhoon-asr-realtime",
  );
const SAMPLE = path.join(HERE, "..", "testdata", "thai", "common-voice-th.wav");
const available = ["encoder.onnx", "decoder.onnx", "vocab.json"].every((name) =>
  existsSync(path.join(MODEL_DIR, name)),
);

describe.skipIf(!available)("Typhoon worker with the real model", () => {
  const THAI = /[\u0e00-\u0e7f]/;

  it(
    "transcribes the Common Voice Thai sample in a worker",
    async () => {
      const runner = createWindowWorker(MODEL_DIR);
      expect(runner.mode).toBe("worker");

      const audio = decodeWavPcm16(readFileSync(SAMPLE));
      const started = Date.now();
      const words = await runner.run(audio, 0, () => {});
      const elapsedSeconds = (Date.now() - started) / 1000;
      await runner.terminate();

      console.log(
        `worker Thai words (${elapsedSeconds.toFixed(1)}s): ${words.map((w) => w.text).join(" ")}`,
      );

      expect(words.length).toBeGreaterThan(0);
      expect(words.some((w) => THAI.test(w.text))).toBe(true);
    },
    300_000,
  );

  it(
    "keeps the event loop free while the worker transcribes",
    async () => {
      const runner = createWindowWorker(MODEL_DIR);
      const audio = decodeWavPcm16(readFileSync(SAMPLE));

      let ticks = 0;
      const interval = setInterval(() => {
        ticks += 1;
      }, 10);
      try {
        await runner.run(audio, 0, () => {});
      } finally {
        clearInterval(interval);
      }
      await runner.terminate();

      expect(ticks).toBeGreaterThan(5);
    },
    300_000,
  );
});
