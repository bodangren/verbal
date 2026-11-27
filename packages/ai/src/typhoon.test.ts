import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AiError } from "./types";
import {
  createTyphoonProvider,
  decodeWavPcm16,
  hasTyphoonModel,
  typhoonModelFiles,
  type LocalTyphoonConfig,
} from "./typhoon";

function wavBytes(samples: readonly number[], options: { sampleRate?: number; channels?: number } = {}): Uint8Array {
  const channels = options.channels ?? 1;
  const sampleRate = options.sampleRate ?? 16000;
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      bytes[offset + i] = text.charCodeAt(i);
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataSize, true);
  samples.forEach((sample, index) => {
    view.setInt16(44 + index * 2, sample, true);
  });

  return bytes;
}

const MODEL_DIR = path.join(path.sep, "models", "typhoon");
const FILES = typhoonModelFiles(MODEL_DIR);

function config(overrides: Partial<LocalTyphoonConfig> = {}): LocalTyphoonConfig {
  return {
    modelDir: MODEL_DIR,
    exists: () => true,
    readText: async () => JSON.stringify(["<unk>", "สวัสดี"]),
    wavPathFor: () => path.join(path.sep, "tmp", "take.wav"),
    removeFile: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("decodeWavPcm16", () => {
  it("reads mono 16-bit samples", () => {
    const samples = decodeWavPcm16(wavBytes([0, 16384, -16384, 32767]));
    expect([...samples]).toEqual([0, 0.5, -0.5, 32767 / 32768]);
  });

  it("averages channels", () => {
    const samples = decodeWavPcm16(wavBytes([100, 300, 0, 0], { channels: 2 }));
    expect(samples).toHaveLength(2);
    expect(samples[0]).toBeCloseTo(200 / 32768, 6);
    expect(samples[1]).toBe(0);
  });

  it("rejects a non-16 kHz or non-PCM file", () => {
    expect(() => decodeWavPcm16(wavBytes([0], { sampleRate: 44100 }))).toThrow(/16000/);
    expect(() => decodeWavPcm16(new Uint8Array(4))).toThrow(/RIFF/);
  });
});

describe("hasTyphoonModel", () => {
  it("requires all three files", () => {
    const seen: string[] = [];
    expect(
      hasTyphoonModel(MODEL_DIR, (filePath) => {
        seen.push(filePath);
        return filePath !== FILES.vocabPath;
      }),
    ).toBe(false);
    expect(seen).toEqual([FILES.encoderPath, FILES.decoderPath, FILES.vocabPath]);
  });
});

describe("createTyphoonProvider", () => {
  it("extracts 16 kHz mono audio, runs the engine, and reports progress", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const removeFile = vi.fn(async () => undefined);
    const audio = new Float32Array([0.1, 0.2, 0.3]);
    const engine = {
      transcribe: vi.fn(async (samples: Float32Array, options?: { onProgress?: (f: number) => void }) => {
        expect([...samples]).toEqual([...audio]);
        options?.onProgress?.(1);
        return {
          text: "สวัสดี",
          language: "th",
          words: [{ text: "สวัสดี", start: 0, end: 0.4 }],
        };
      }),
    };
    const progress: number[] = [];

    const provider = createTyphoonProvider(
      config({
        run,
        readWav: async () => audio,
        engineFor: () => engine,
        removeFile,
      }),
    );

    const result = await provider.transcribe(
      { filePath: path.join(path.sep, "media", "take.mp4") },
      { onProgress: (fraction) => progress.push(fraction) },
    );

    expect(result.words).toEqual([{ text: "สวัสดี", start: 0, end: 0.4 }]);
    expect(run).toHaveBeenCalledTimes(1);
    const [binary, args] = run.mock.calls[0] as unknown as [string, string[]];
    expect(binary).toBe("ffmpeg");
    expect(args).toEqual([
      "-v",
      "error",
      "-y",
      "-i",
      path.join(path.sep, "media", "take.mp4"),
      "-vn",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      path.join(path.sep, "tmp", "take.wav"),
    ]);
    expect(progress[0]).toBe(0.05);
    expect(progress.at(-1)).toBe(1);
    expect(removeFile).toHaveBeenCalledWith(path.join(path.sep, "tmp", "take.wav"));
  });

  it("transcribes each window separately and merges words with absolute times", async () => {
    const sampleRate = 16000;
    const signal = new Float32Array(sampleRate * 0.4);
    for (let i = 0; i < signal.length; i += 1) {
      signal[i] = i / signal.length;
    }
    let call = 0;
    const engine = {
      transcribe: vi.fn(
        async (_samples: Float32Array, options?: { onProgress?: (f: number) => void }) => {
          call += 1;
          options?.onProgress?.(1);
          return {
            text: `w${call}`,
            language: "th",
            words: [{ text: `w${call}`, start: 0.1, end: 0.2 }],
          };
        },
      ),
    };
    const progress: number[] = [];

    const provider = createTyphoonProvider(
      config({
        run: vi.fn(async () => ({ stdout: "", stderr: "" })),
        readWav: async () => signal,
        engineFor: () => engine,
        windowSeconds: 0.3,
        overlapSeconds: 0.1,
      }),
    );

    const result = await provider.transcribe(
      { filePath: path.join(path.sep, "media", "take.mp4") },
      { onProgress: (fraction) => progress.push(fraction) },
    );

    expect(engine.transcribe).toHaveBeenCalledTimes(2);
    const calls = engine.transcribe.mock.calls as unknown as [Float32Array, unknown][];
    expect(calls[0]![0].length).toBe(4800);
    expect(calls[1]![0].length).toBe(3200);
    expect(calls[1]![0][0]).toBe(signal[3200]);

    expect(result.words).toEqual([
      { text: "w1", start: 0.1, end: 0.2 },
      { text: "w2", start: 0.3, end: 0.4 },
    ]);
    expect(result.text).toBe("w1 w2");
    expect(progress).toEqual([0.05, 0.5, 0.95, 1]);
  });

  it("fails as not-configured when the model is missing", async () => {
    const provider = createTyphoonProvider(config({ exists: () => false }));

    await expect(
      provider.transcribe({ filePath: "/media/take.mp4" }),
    ).rejects.toMatchObject({ code: "not-configured" });
  });

  it("maps a missing ffmpeg to not-configured", async () => {
    const missing = Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
    const provider = createTyphoonProvider(
      config({ run: async () => Promise.reject(missing) }),
    );

    await expect(provider.transcribe({ filePath: "/media/take.mp4" })).rejects.toMatchObject({
      code: "not-configured",
    });
  });

  it("reports cancellation before doing any work", async () => {
    const provider = createTyphoonProvider(config());
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.transcribe({ filePath: "/media/take.mp4" }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AiError);
  });

  it("treats an empty decode as an invalid response", async () => {
    const provider = createTyphoonProvider(
      config({
        run: async () => ({ stdout: "", stderr: "" }),
        readWav: async () => new Float32Array([0.1]),
        engineFor: () => ({
          transcribe: async () => ({ text: "", language: "th", words: [] }),
        }),
      }),
    );

    await expect(provider.transcribe({ filePath: "/media/take.mp4" })).rejects.toMatchObject({
      code: "invalid-response",
    });
  });
});

describe("Typhoon scratch directory", () => {
  const SCRATCH_PREFIX = path.join(os.tmpdir(), "verbal-asr-");
  const MEDIA = path.join(path.sep, "media", "take.mp4");

  function scratchConfig(overrides: Partial<LocalTyphoonConfig> = {}): LocalTyphoonConfig {
    return {
      modelDir: MODEL_DIR,
      exists: () => true,
      readText: async () => JSON.stringify(["<unk>", "สวัสดี"]),
      readWav: async () => new Float32Array([0.1]),
      engineFor: () => ({
        transcribe: async () => ({
          text: "สวัสดี",
          language: "th",
          words: [{ text: "สวัสดี", start: 0, end: 0.1 }],
        }),
      }),
      ...overrides,
    };
  }

  it("gives two concurrent calls different private directories", async () => {
    const dirs: string[] = [];
    const live: { dir: string; existed: boolean }[] = [];
    let arrived = 0;
    let release: () => void = () => {};
    const bothArrived = new Promise<void>((resolve) => {
      release = resolve;
    });

    const run = vi.fn(async (binary: string, args: readonly string[]) => {
      if (binary === "ffmpeg") {
        dirs.push(path.dirname(String(args.at(-1))));
        arrived += 1;
        if (arrived === 2) {
          for (const dir of dirs) {
            live.push({ dir, existed: existsSync(dir) });
          }
          release();
        }
        await bothArrived;
      }
      return { stdout: "", stderr: "" };
    });

    const provider = createTyphoonProvider(scratchConfig({ run }));
    await Promise.all([
      provider.transcribe({ filePath: MEDIA }),
      provider.transcribe({ filePath: MEDIA }),
    ]);

    expect(live).toHaveLength(2);
    expect(live[0]!.dir).not.toBe(live[1]!.dir);
    for (const entry of live) {
      expect(entry.dir.startsWith(SCRATCH_PREFIX)).toBe(true);
      expect(entry.existed).toBe(true);
      expect(existsSync(entry.dir)).toBe(false);
    }
  });

  it("removes the private directory after success", async () => {
    let wav = "";
    const run = vi.fn(async (binary: string, args: readonly string[]) => {
      if (binary === "ffmpeg") {
        wav = String(args.at(-1));
      }
      return { stdout: "", stderr: "" };
    });

    const provider = createTyphoonProvider(scratchConfig({ run }));
    const result = await provider.transcribe({ filePath: MEDIA });

    expect(result.words).toHaveLength(1);
    const dir = path.dirname(wav);
    expect(dir.startsWith(SCRATCH_PREFIX)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it("removes the private directory after a failure", async () => {
    let wav = "";
    const run = vi.fn(async (binary: string, args: readonly string[]) => {
      if (binary === "ffmpeg") {
        wav = String(args.at(-1));
        throw new Error("ffmpeg failed");
      }
      return { stdout: "", stderr: "" };
    });

    const provider = createTyphoonProvider(scratchConfig({ run }));
    await expect(provider.transcribe({ filePath: MEDIA })).rejects.toMatchObject({
      code: "request-failed",
      message: "ffmpeg failed",
    });

    const dir = path.dirname(wav);
    expect(dir.startsWith(SCRATCH_PREFIX)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it("removes the private directory after an abort", async () => {
    const controller = new AbortController();
    let wav = "";
    const run = vi.fn(async (binary: string, args: readonly string[]) => {
      if (binary === "ffmpeg") {
        wav = String(args.at(-1));
        controller.abort();
        throw new Error("killed");
      }
      return { stdout: "", stderr: "" };
    });

    const provider = createTyphoonProvider(scratchConfig({ run }));
    await expect(
      provider.transcribe({ filePath: MEDIA }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "request-failed", message: "transcription cancelled" });

    const dir = path.dirname(wav);
    expect(dir.startsWith(SCRATCH_PREFIX)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it("writes outside a read-only source folder", async () => {
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "verbal-readonly-"));
    await fs.chmod(sourceDir, 0o555);
    let wav = "";

    try {
      const run = vi.fn(async (binary: string, args: readonly string[]) => {
        if (binary === "ffmpeg") {
          wav = String(args.at(-1));
        }
        return { stdout: "", stderr: "" };
      });

      const provider = createTyphoonProvider(scratchConfig({ run }));
      const result = await provider.transcribe({
        filePath: path.join(sourceDir, "take.mp4"),
      });

      expect(result.words).toHaveLength(1);
      expect(wav).not.toBe("");
      expect(path.dirname(wav)).not.toBe(sourceDir);
      expect(path.dirname(wav).startsWith(SCRATCH_PREFIX)).toBe(true);
      expect(await fs.readdir(sourceDir)).toEqual([]);
    } finally {
      await fs.chmod(sourceDir, 0o755);
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
  });
});
