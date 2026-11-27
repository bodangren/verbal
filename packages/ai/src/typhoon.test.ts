import { existsSync, promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { AiError, type SpokenWord } from "./types";
import {
  createTyphoonProvider,
  decodeWavPcm16,
  hasTyphoonModel,
  openWavFile,
  typhoonModelFiles,
  type LocalTyphoonConfig,
} from "./typhoon";
import { createWindowWorker, type RunWindow } from "./typhoon-worker";
import { mergeWindowResults, planWindows } from "./typhoon-window";

const TMPDIR = process.env.TMPDIR ?? os.tmpdir();

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

function wavWithList(samples: readonly number[]): Uint8Array {
  const dataSize = samples.length * 2;
  const listSize = 8;
  const total = 12 + 8 + 16 + 8 + listSize + 8 + dataSize;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      bytes[offset + i] = text.charCodeAt(i);
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, total - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "LIST");
  view.setUint32(40, listSize, true);
  ascii(44, "INFO");
  ascii(48, "abcd");
  const dataOffset = 36 + 8 + listSize;
  ascii(dataOffset, "data");
  view.setUint32(dataOffset + 4, dataSize, true);
  samples.forEach((sample, index) => {
    view.setInt16(dataOffset + 8 + index * 2, sample, true);
  });

  return bytes;
}

async function writeSilentWav(filePath: string, seconds: number): Promise<void> {
  const sampleRate = 16000;
  const dataSize = seconds * sampleRate * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "latin1");
  header.write("fmt ", 12, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(dataSize, 40);

  const handle = await fs.open(filePath, "w");
  try {
    await handle.write(header, 0, 44, 0);
    const zero = Buffer.alloc(1 << 20);
    let written = 0;
    while (written < dataSize) {
      const chunk = Math.min(zero.length, dataSize - written);
      await handle.write(zero, 0, chunk, 44 + written);
      written += chunk;
    }
  } finally {
    await handle.close();
  }
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

describe("createTyphoonProvider window worker seam", () => {
  const MEDIA = path.join(path.sep, "media", "take.mp4");

  function workerConfig(overrides: Partial<LocalTyphoonConfig> = {}): LocalTyphoonConfig {
    return {
      modelDir: MODEL_DIR,
      exists: () => true,
      readText: async () => JSON.stringify(["<unk>", "สวัสดี"]),
      wavPathFor: () => path.join(path.sep, "tmp", "take.wav"),
      run: vi.fn(async () => ({ stdout: "", stderr: "" })),
      readWav: async () => new Float32Array([0.1, 0.2]),
      removeFile: vi.fn(async () => undefined),
      ...overrides,
    };
  }

  it("keeps the event loop free while a window runs", async () => {
    const runWindow: RunWindow = () => ({
      mode: "worker",
      run: async (_samples, _index, onProgress) => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        onProgress(1);
        return [{ text: "สวัสดี", start: 0, end: 0.1 }];
      },
      terminate: async () => {},
    });

    const provider = createTyphoonProvider(workerConfig({ runWindow }));

    let ticks = 0;
    const interval = setInterval(() => {
      ticks += 1;
    }, 10);

    try {
      await provider.transcribe({ filePath: MEDIA });
    } finally {
      clearInterval(interval);
    }

    expect(ticks).toBeGreaterThanOrEqual(5);
  });

  it("terminates the worker and rejects within 1 s on abort", async () => {
    const run = vi.fn(() => new Promise<SpokenWord[]>(() => {}));
    const terminate = vi.fn(async () => {});
    const runWindow: RunWindow = () => ({ mode: "worker", run, terminate });

    const provider = createTyphoonProvider(workerConfig({ runWindow }));
    const controller = new AbortController();
    const started = Date.now();

    const job = provider.transcribe({ filePath: MEDIA }, { signal: controller.signal });
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    controller.abort();

    await expect(job).rejects.toMatchObject({
      code: "request-failed",
      message: "transcription cancelled",
    });
    expect(terminate).toHaveBeenCalled();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("reports per-window progress", async () => {
    const runWindow: RunWindow = () => ({
      mode: "worker",
      run: async (_samples, index, onProgress) => {
        onProgress(0.5);
        onProgress(1);
        return [{ text: `w${index}`, start: 0, end: 0.1 }];
      },
      terminate: async () => {},
    });

    const signal = new Float32Array(16000 * 0.4);
    const provider = createTyphoonProvider(
      workerConfig({ readWav: async () => signal, runWindow, windowSeconds: 0.3, overlapSeconds: 0.1 }),
    );
    const progress: number[] = [];

    await provider.transcribe({ filePath: MEDIA }, { onProgress: (fraction) => progress.push(fraction) });

    expect(progress).toEqual([0.05, 0.275, 0.5, 0.725, 0.95, 1]);
  });

  it("terminates the worker after success and after failure", async () => {
    const terminateOk = vi.fn(async () => {});
    const okProvider = createTyphoonProvider(
      workerConfig({
        runWindow: () => ({
          mode: "worker",
          run: async () => [{ text: "สวัสดี", start: 0, end: 0.1 }],
          terminate: terminateOk,
        }),
      }),
    );
    await okProvider.transcribe({ filePath: MEDIA });
    expect(terminateOk).toHaveBeenCalled();

    const terminateFail = vi.fn(async () => {});
    const failProvider = createTyphoonProvider(
      workerConfig({
        runWindow: () => ({
          mode: "worker",
          run: async () => {
            throw new Error("worker crashed");
          },
          terminate: terminateFail,
        }),
      }),
    );
    await expect(failProvider.transcribe({ filePath: MEDIA })).rejects.toMatchObject({
      code: "request-failed",
      message: "worker crashed",
    });
    expect(terminateFail).toHaveBeenCalled();
  });
});

describe("createTyphoonProvider streams the WAV", () => {
  const MEDIA = path.join(path.sep, "media", "take.mp4");

  it("reads each window as a bounded range and never the whole signal", async () => {
    const sampleRate = 16000;
    const windowSeconds = 0.3;
    const overlapSeconds = 0.1;
    const totalSamples = sampleRate * 2;
    const requested: Array<{ start: number; end: number }> = [];
    const closed = vi.fn(async () => {});

    const openWav = vi.fn(async () => ({
      totalSamples,
      async read(startSample: number, endSample: number) {
        requested.push({ start: startSample, end: endSample });
        return new Float32Array(endSample - startSample);
      },
      close: closed,
    }));

    const engine = {
      transcribe: vi.fn(async () => ({
        text: "w",
        language: "th",
        words: [{ text: "w", start: 0, end: 0.1 }],
      })),
    };

    const provider = createTyphoonProvider(
      config({
        openWav,
        engineFor: () => engine,
        run: async () => ({ stdout: "", stderr: "" }),
        windowSeconds,
        overlapSeconds,
      }),
    );

    const result = await provider.transcribe({ filePath: MEDIA });

    const windowSamples = Math.round(windowSeconds * sampleRate);
    expect(requested.length).toBeGreaterThan(1);
    const maxBytes = Math.max(...requested.map((range) => range.end - range.start)) * 2;
    expect(maxBytes).toBeLessThanOrEqual(windowSamples * 2);
    for (const range of requested) {
      expect(range.end - range.start).toBeGreaterThan(0);
      expect(range.end - range.start).toBeLessThan(totalSamples);
    }
    expect(closed).toHaveBeenCalled();
    expect(result.words.length).toBeGreaterThan(0);
  });

  it("rejects a WAV with the wrong sample rate or channels from disk", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "verbal-wavheader-"));
    try {
      const badRate = path.join(dir, "rate.wav");
      const badChannels = path.join(dir, "channels.wav");
      await fs.writeFile(badRate, wavBytes([0], { sampleRate: 44100 }));
      await fs.writeFile(badChannels, wavBytes([0], { channels: 0 }));

      const rateProvider = createTyphoonProvider(
        config({ wavPathFor: () => badRate, run: async () => ({ stdout: "", stderr: "" }) }),
      );
      await expect(rateProvider.transcribe({ filePath: MEDIA })).rejects.toMatchObject({
        code: "request-failed",
        message: expect.stringContaining("16000"),
      });

      const channelsProvider = createTyphoonProvider(
        config({ wavPathFor: () => badChannels, run: async () => ({ stdout: "", stderr: "" }) }),
      );
      await expect(channelsProvider.transcribe({ filePath: MEDIA })).rejects.toMatchObject({
        code: "request-failed",
        message: expect.stringContaining("16-bit PCM"),
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("createTyphoonProvider rejects a truncated WAV", () => {
  const MEDIA = path.join(path.sep, "media", "take.mp4");

  it("rejects a WAV whose data chunk claims more bytes than the file holds", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "verbal-trunc-"));
    try {
      const wavPath = path.join(dir, "trunc.wav");
      const full = wavBytes(new Array(1000).fill(0));
      await fs.writeFile(wavPath, full.subarray(0, 44 + 1000));

      const provider = createTyphoonProvider(
        config({
          wavPathFor: () => wavPath,
          run: async () => ({ stdout: "", stderr: "" }),
          engineFor: () => ({
            transcribe: async () => ({ text: "w", language: "th", words: [{ text: "w", start: 0, end: 0.1 }] }),
          }),
        }),
      );

      await expect(provider.transcribe({ filePath: MEDIA })).rejects.toMatchObject({
        code: "request-failed",
        message: expect.stringContaining("audio file is truncated"),
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("reads a WAV with a LIST chunk before the data", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "verbal-list-"));
    try {
      const wavPath = path.join(dir, "list.wav");
      await fs.writeFile(wavPath, wavWithList([100, 200, 300]));

      let received: Float32Array | undefined;
      const engine = {
        transcribe: vi.fn(async (samples: Float32Array) => {
          received = samples;
          return { text: "w", language: "th", words: [{ text: "w", start: 0, end: 0.1 }] };
        }),
      };
      const provider = createTyphoonProvider(
        config({
          wavPathFor: () => wavPath,
          run: async () => ({ stdout: "", stderr: "" }),
          engineFor: () => engine,
        }),
      );

      const result = await provider.transcribe({ filePath: MEDIA });

      expect(result.words).toHaveLength(1);
      expect(received).toHaveLength(3);
      expect(received![0]).toBeCloseTo(100 / 32768, 6);
      expect(received![1]).toBeCloseTo(200 / 32768, 6);
      expect(received![2]).toBeCloseTo(300 / 32768, 6);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("throws when a window read returns fewer bytes than requested", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "verbal-short-"));
    try {
      const wavPath = path.join(dir, "short.wav");
      await fs.writeFile(wavPath, wavBytes(new Array(1000).fill(0)));

      const reader = await openWavFile(wavPath);
      try {
        await expect(reader.read(0, 1001)).rejects.toThrow("audio file is truncated");
      } finally {
        await reader.close();
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects a last-window read one byte short after the file is truncated", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "verbal-trunc-last-"));
    try {
      const wavPath = path.join(dir, "trunc-last.wav");
      await fs.writeFile(wavPath, wavBytes(new Array(1000).fill(0)));

      const reader = await openWavFile(wavPath);
      try {
        // Truncate one byte after the header was validated at open.
        await fs.truncate(wavPath, 44 + 1000 * 2 - 1);
        // The last window requests the whole signal; one byte is now missing.
        await expect(reader.read(0, 1000)).rejects.toThrow("audio file is truncated");
      } finally {
        await reader.close();
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects an injected reader that returns fewer samples than requested", async () => {
    const openWav = vi.fn(async () => ({
      totalSamples: 1000,
      async read() {
        return new Float32Array(10);
      },
      async close() {},
    }));

    const provider = createTyphoonProvider(
      config({
        openWav,
        run: async () => ({ stdout: "", stderr: "" }),
        engineFor: () => ({
          transcribe: async () => ({
            text: "w",
            language: "th",
            words: [{ text: "w", start: 0, end: 0.1 }],
          }),
        }),
      }),
    );

    await expect(provider.transcribe({ filePath: MEDIA })).rejects.toMatchObject({
      code: "request-failed",
      message: expect.stringContaining("audio file is truncated"),
    });
  });
});

describe("createTyphoonProvider streaming memory", () => {
  const MEDIA = path.join(path.sep, "media", "take.mp4");

  it(
    "keeps peak RSS growth under 150 MB for a 30 minute WAV",
    { timeout: 180_000 },
    async () => {
      const dir = await fs.mkdtemp(path.join(TMPDIR, "verbal-rss-"));
      const wavPath = path.join(dir, "thirty-min.wav");
      try {
        await writeSilentWav(wavPath, 30 * 60);

        const engine = {
          transcribe: vi.fn(async () => ({ text: "", language: "th", words: [] })),
        };
        const provider = createTyphoonProvider(
          config({
            wavPathFor: () => wavPath,
            run: async () => ({ stdout: "", stderr: "" }),
            engineFor: () => engine,
          }),
        );

        const before = process.memoryUsage().rss;
        let peak = before;
        const timer = setInterval(() => {
          peak = Math.max(peak, process.memoryUsage().rss);
        }, 25);

        let caught: unknown;
        try {
          await provider.transcribe({ filePath: MEDIA });
        } catch (error) {
          caught = error;
        } finally {
          clearInterval(timer);
        }

        const growth = peak - before;
        console.log(
          `measured peak RSS growth for 30 min streaming: ${growth} bytes (${(growth / (1024 * 1024)).toFixed(1)} MB)`,
        );

        expect(caught).toMatchObject({ code: "invalid-response" });
        expect(engine.transcribe.mock.calls.length).toBeGreaterThan(30);
        expect(growth).toBeLessThan(150 * 1024 * 1024);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  );
});

function wavFromFloat32(samples: Float32Array, sampleRate = 16000): Uint8Array {
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
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
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  return bytes;
}

const REAL_HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_MODEL_DIR =
  process.env.VERBAL_TYPHOON_MODEL ??
  path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "verbal",
    "models",
    "typhoon-asr-realtime",
  );
const REAL_SAMPLE = path.join(REAL_HERE, "..", "testdata", "thai", "common-voice-th.wav");
const realModelAvailable = ["encoder.onnx", "decoder.onnx", "vocab.json"].every((name) =>
  existsSync(path.join(REAL_MODEL_DIR, name)),
);

describe.skipIf(!realModelAvailable)("Typhoon window seam with the real model", () => {
  it(
    "reports the merged 3x repeat against the one-window result",
    { timeout: 300_000 },
    async () => {
      const audio = decodeWavPcm16(readFileSync(REAL_SAMPLE));
      const tripled = new Float32Array(audio.length * 3);
      for (let i = 0; i < 3; i += 1) {
        tripled.set(audio, i * audio.length);
      }

      const wavPath = path.join(TMPDIR, `typhoon-seam-${process.pid}.wav`);
      await fs.writeFile(wavPath, wavFromFloat32(tripled));

      const runner = createWindowWorker(REAL_MODEL_DIR);
      try {
        const windows = planWindows(tripled.length, 16000, {
          windowSeconds: 5,
          overlapSeconds: 1,
        });
        const perWindow: SpokenWord[][] = [];
        for (let i = 0; i < windows.length; i += 1) {
          const window = windows[i]!;
          perWindow.push(
            await runner.run(
              tripled.slice(window.startSample, window.endSample),
              i,
              () => {},
            ),
          );
        }
        const merged = mergeWindowResults(windows, perWindow);
        const oneShot = await runner.run(tripled.slice(), 0, () => {});

        console.log(
          `seam merged (${windows.length} windows): ${merged.map((w) => w.text).join(" ")}`,
        );
        console.log(`seam one-shot: ${oneShot.map((w) => w.text).join(" ")}`);
        console.log(`seam merged ${merged.length} words, one-shot ${oneShot.length} words`);
      } finally {
        await runner.terminate();
        await fs.rm(wavPath, { force: true });
      }
    },
  );
});
