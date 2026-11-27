import { existsSync, promises as nodeFs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isMissingBinary, messageOf, nodeRun, type LocalRunner } from "./process";
import { createTyphoonEngine, SAMPLE_RATE, type TyphoonEngine } from "./typhoon-engine";
import {
  createInProcessWindowWorker,
  createWindowWorker,
  type RunWindow,
  type WindowWorker,
} from "./typhoon-worker";
import { mergeWindowResults, planWindows } from "./typhoon-window";
import {
  AiError,
  type SpokenWord,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types";

export const TYPHOON_ENCODER_FILE = "encoder.onnx";
export const TYPHOON_DECODER_FILE = "decoder.onnx";
export const TYPHOON_VOCAB_FILE = "vocab.json";

export type TyphoonModelFiles = {
  encoderPath: string;
  decoderPath: string;
  vocabPath: string;
};

/** Canonical names inside the model directory, regardless of the download source. */
export function typhoonModelFiles(modelDir: string): TyphoonModelFiles {
  return {
    encoderPath: path.join(modelDir, TYPHOON_ENCODER_FILE),
    decoderPath: path.join(modelDir, TYPHOON_DECODER_FILE),
    vocabPath: path.join(modelDir, TYPHOON_VOCAB_FILE),
  };
}

/** True when every file the engine needs is present. */
export function hasTyphoonModel(
  modelDir: string,
  exists: (filePath: string) => boolean,
): boolean {
  const files = typhoonModelFiles(modelDir);
  return (
    exists(files.encoderPath) && exists(files.decoderPath) && exists(files.vocabPath)
  );
}

/** Reads 16-bit PCM WAV bytes as mono float samples in [-1, 1). */
export function decodeWavPcm16(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number): string =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  if (bytes.length < 12 || ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE") {
    throw new Error("the extracted audio is not a RIFF/WAVE file");
  }

  let offset = 12;
  let audioFormat: number | undefined;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let dataStart = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const id = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;

    if (id === "fmt " && start + 16 <= bytes.length) {
      audioFormat = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      bitsPerSample = view.getUint16(start + 14, true);
    } else if (id === "data") {
      dataStart = start;
      dataSize = Math.min(size, bytes.length - start);
      break;
    }

    offset = start + size + (size % 2);
  }

  if (audioFormat !== 1 || bitsPerSample !== 16 || channels === undefined || channels < 1) {
    throw new Error("the extracted audio is not 16-bit PCM");
  }
  if (sampleRate !== 16000) {
    throw new Error(`the extracted audio is ${sampleRate ?? "unknown"} Hz, expected 16000`);
  }
  if (dataStart === -1) {
    throw new Error("the extracted audio has no data chunk");
  }

  const frames = Math.floor(dataSize / (2 * channels));
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += view.getInt16(dataStart + (frame * channels + channel) * 2, true);
    }
    samples[frame] = sum / channels / 32768;
  }

  return samples;
}

/** One engine (and its ONNX sessions) per model pair, reused across jobs. */
let sharedEngine: { key: string; engine: TyphoonEngine } | undefined;

/** Test seam: drop the cached sessions. */
export function resetTyphoonEngineCache(): void {
  sharedEngine = undefined;
}

export type LocalTyphoonConfig = {
  /** Directory holding encoder.onnx, decoder.onnx, and vocab.json. */
  modelDir: string;
  run?: LocalRunner;
  exists?: (filePath: string) => boolean;
  readText?: (filePath: string) => Promise<string>;
  readWav?: (filePath: string) => Promise<Float32Array>;
  removeFile?: (filePath: string) => Promise<void>;
  /** Builds the WAV path from the media path and the private scratch directory. */
  wavPathFor?: (filePath: string, scratchDir: string) => string;
  /** Test seam: supplies an engine without ONNX Runtime. */
  engineFor?: (files: TyphoonModelFiles, vocab: readonly string[]) => TyphoonEngine;
  /** Test seam: runs each window; the default spawns a real worker. */
  runWindow?: RunWindow;
  /** Window length in seconds for windowed inference. */
  windowSeconds?: number;
  /** Overlap between windows in seconds. */
  overlapSeconds?: number;
};

async function readVocab(readText: (path: string) => Promise<string>, filePath: string): Promise<string[]> {
  let raw: string;
  try {
    raw = await readText(filePath);
  } catch (error) {
    throw new AiError("not-configured", `the Typhoon vocabulary is missing: ${messageOf(error)}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AiError("request-failed", "the Typhoon vocabulary is not valid JSON");
  }

  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new AiError("request-failed", "the Typhoon vocabulary is not a string array");
  }
  return value;
}

function engineFor(
  config: LocalTyphoonConfig,
  files: TyphoonModelFiles,
  vocab: readonly string[],
): TyphoonEngine {
  if (config.engineFor !== undefined) {
    return config.engineFor(files, vocab);
  }

  const key = `${files.encoderPath}\u0000${files.decoderPath}`;
  if (sharedEngine?.key !== key) {
    sharedEngine = {
      key,
      engine: createTyphoonEngine({
        encoderPath: files.encoderPath,
        decoderPath: files.decoderPath,
        vocab,
      }),
    };
  }
  return sharedEngine.engine;
}

/**
 * Awaits a promise, but rejects early with `error` when the signal aborts.
 * `onAbort` runs once at that moment, before the rejection. The losing promise
 * is still awaited by its handlers, so its rejection is never unhandled.
 */
function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => void,
  error: AiError,
): Promise<T> {
  if (signal === undefined) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const onAbortListener = (): void => {
      signal.removeEventListener("abort", onAbortListener);
      onAbort();
      reject(error);
    };
    if (signal.aborted) {
      onAbortListener();
      return;
    }
    signal.addEventListener("abort", onAbortListener, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbortListener);
        resolve(value);
      },
      (cause) => {
        signal.removeEventListener("abort", onAbortListener);
        reject(cause);
      },
    );
  });
}

/**
 * A transcription provider backed by Typhoon ASR Realtime.
 *
 * The model is not bundled: the fetch script puts it under the app's data
 * directory, and a missing model is reported as `not-configured` (503), the
 * same way a missing API key is. Audio is extracted to 16 kHz mono WAV with
 * FFmpeg, exactly as for the whisper provider; Thai word boundaries come from
 * the engine's token spans. Each call writes its WAV in a private temp
 * directory and removes that directory when the call ends.
 */
export function createTyphoonProvider(config: LocalTyphoonConfig): TranscriptionProvider {
  const run: LocalRunner = config.run ?? nodeRun;
  const exists = config.exists ?? ((filePath: string) => existsSync(filePath));
  const readText =
    config.readText ?? ((filePath: string) => nodeFs.readFile(filePath, "utf8"));
  const readWav =
    config.readWav ??
    (async (filePath: string) => decodeWavPcm16(await nodeFs.readFile(filePath)));
  const removeFile =
    config.removeFile ?? ((filePath: string) => nodeFs.rm(filePath, { force: true }));
  const wavPathFor =
    config.wavPathFor ??
    ((filePath: string, scratchDir: string) =>
      path.join(scratchDir, `${path.parse(filePath).name || "audio"}.wav`));

  return {
    id: "local-typhoon",

    async transcribe(request, options) {
      const files = typhoonModelFiles(config.modelDir);
      if (!hasTyphoonModel(config.modelDir, exists)) {
        throw new AiError(
          "not-configured",
          `the Typhoon model is missing from ${config.modelDir}: run "npm run fetch:typhoon" or set VERBAL_TYPHOON_MODEL`,
        );
      }

      const vocab = await readVocab(readText, files.vocabPath);
      const scratchDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), "verbal-asr-"));
      const wavPath = wavPathFor(request.filePath, scratchDir);
      let lastPercent = -1;

      const report = (fraction: number, force = false): void => {
        const value = Number(Math.min(1, Math.max(0, fraction)).toFixed(4));
        const percent = Math.round(value * 100);
        if (!force && percent <= lastPercent) {
          return;
        }
        lastPercent = percent;
        options?.onProgress?.(value);
      };

      const cancelled = (): boolean => options?.signal?.aborted === true;

      try {
        if (cancelled()) {
          throw new AiError("request-failed", "transcription cancelled");
        }

        try {
          await run(
            "ffmpeg",
            [
              "-v",
              "error",
              "-y",
              "-i",
              request.filePath,
              "-vn",
              "-ar",
              "16000",
              "-ac",
              "1",
              "-c:a",
              "pcm_s16le",
              wavPath,
            ],
            { signal: options?.signal },
          );
        } catch (error) {
          if (isMissingBinary(error)) {
            throw new AiError("not-configured", "the ffmpeg binary is not available");
          }
          if (cancelled()) {
            throw new AiError("request-failed", "transcription cancelled");
          }
          throw new AiError("request-failed", messageOf(error));
        }

        report(0.05, true);

        let audio: Float32Array;
        try {
          audio = await readWav(wavPath);
        } catch (error) {
          throw new AiError("request-failed", `the extracted audio could not be read: ${messageOf(error)}`);
        }

        const windows = planWindows(audio.length, SAMPLE_RATE, {
          windowSeconds: config.windowSeconds,
          overlapSeconds: config.overlapSeconds,
        });

        // One worker for the whole call: the ONNX sessions load once and stay
        // warm. Feature extraction and decode run off the main thread, so the
        // API and Cancel keep answering. A test seam runs in-process instead.
        const windowWorker: WindowWorker =
          config.runWindow !== undefined
            ? config.runWindow(config.modelDir)
            : config.engineFor !== undefined
              ? createInProcessWindowWorker(engineFor(config, files, vocab))
              : createWindowWorker(config.modelDir);

        // Transcribe one bounded window at a time. Each call resets the RNNT
        // decoder state, so a word at a seam may lose a little context. The
        // overlap lets the merge keep the better half of each seam.
        const windowWords: SpokenWord[][] = [];
        try {
          for (let i = 0; i < windows.length; i += 1) {
            if (cancelled()) {
              throw new AiError("request-failed", "transcription cancelled");
            }
            const window = windows[i]!;
            const slice = audio.slice(window.startSample, window.endSample);
            const words = await abortable(
              windowWorker.run(
                slice,
                i,
                (fraction) => report(0.05 + ((i + fraction) / windows.length) * 0.9),
              ),
              options?.signal,
              () => void windowWorker.terminate(),
              new AiError("request-failed", "transcription cancelled"),
            );
            windowWords.push(words);
          }
        } catch (error) {
          if (cancelled() || messageOf(error) === "transcription cancelled") {
            throw new AiError("request-failed", "transcription cancelled");
          }
          throw new AiError("request-failed", messageOf(error));
        } finally {
          await windowWorker.terminate();
        }

        const words = mergeWindowResults(windows, windowWords);
        if (words.length === 0) {
          throw new AiError("invalid-response", "the Typhoon model returned no words");
        }

        const result: TranscriptionResult = {
          text: words.map((word) => word.text).join(" "),
          language: "th",
          words,
        };

        report(1);
        return result;
      } finally {
        await removeFile(wavPath).catch(() => {});
        await nodeFs.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}
