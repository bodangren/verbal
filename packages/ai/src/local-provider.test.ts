import { describe, expect, it, vi } from "vitest";
import { buildLocalArgs, createLocalWhisperProvider } from "./local";
import { AiError } from "./types";

const JSON_OUTPUT = JSON.stringify({
  transcription: [
    { text: " hello", offsets: { from: 0, to: 400 } },
    { text: " world", offsets: { from: 420, to: 900 } },
  ],
  result: { language: "en" },
});

const FFMPEG_ARGS = [
  "-v",
  "error",
  "-y",
  "-i",
  "/media/take.mp4",
  "-vn",
  "-ar",
  "16000",
  "-ac",
  "1",
  "-c:a",
  "pcm_s16le",
  "/tmp/take.wav",
];

const WHISPER_ARGS = [
  "-m",
  "/models/ggml-base.bin",
  "-f",
  "/tmp/take.wav",
  "-l",
  "auto",
  "-oj",
  "-ml",
  "1",
  "-sow",
  "-pp",
  "-of",
  "/tmp/take",
];

describe("buildLocalArgs", () => {
  it("passes every value as its own argument", () => {
    expect(
      buildLocalArgs({
        modelPath: "/models/ggml-base.bin",
        filePath: "/tmp/take.wav",
        outputStem: "/tmp/take",
      }),
    ).toEqual(WHISPER_ARGS);
  });

  it("uses the given language when one is supplied", () => {
    expect(
      buildLocalArgs({
        modelPath: "/models/ggml-base.bin",
        filePath: "/tmp/take.wav",
        outputStem: "/tmp/take",
        language: "th",
      })[5],
    ).toBe("th");
  });
});

describe("createLocalWhisperProvider", () => {
  it("extracts WAV audio, runs whisper and removes the WAV", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const removeFile = vi.fn(async () => {});

    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run,
      stemFor: () => "/tmp/take",
      readOutput: async () => JSON_OUTPUT,
      removeFile,
    });

    const result = await provider.transcribe({ filePath: "/media/take.mp4" });

    expect(provider.id).toBe("local-whisper");
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(1, "ffmpeg", FFMPEG_ARGS, expect.any(Object));
    expect(run).toHaveBeenNthCalledWith(
      2,
      "whisper-cli",
      WHISPER_ARGS,
      expect.objectContaining({ onStderr: expect.any(Function) }),
    );
    expect(removeFile).toHaveBeenCalledWith("/tmp/take.wav");
    expect(result.words.map((word) => word.text)).toEqual(["hello", "world"]);
    expect(result.language).toBe("en");
  });

  it("passes a configured language through to whisper", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));

    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      language: "th",
      run,
      stemFor: () => "/tmp/take",
      readOutput: async () => JSON_OUTPUT,
    });

    await provider.transcribe({ filePath: "/media/take.mp4" });

    expect(run).toHaveBeenNthCalledWith(
      2,
      "whisper-cli",
      [...WHISPER_ARGS.slice(0, 5), "th", ...WHISPER_ARGS.slice(6)],
      expect.any(Object),
    );
  });

  it("reports extraction, whisper progress and completion", async () => {
    const run = vi.fn(
      async (
        binary: string,
        _args: readonly string[],
        options?: { onStderr?: (chunk: string) => void },
      ) => {
        if (binary === "whisper-cli") {
          options?.onStderr?.("whisper_print_progress_callback: progress =  64%\n");
          options?.onStderr?.("whisper_print_progress_callback: progress = 100%\n");
        }
        return { stdout: "", stderr: "" };
      },
    );
    const onProgress = vi.fn();

    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run,
      stemFor: () => "/tmp/take",
      readOutput: async () => JSON_OUTPUT,
    });

    await provider.transcribe({ filePath: "/media/take.mp4" }, { onProgress });

    expect(onProgress.mock.calls.map((call) => call[0])).toEqual([0.05, 0.626, 0.95, 1]);
  });

  it("throttles repeated percentages and never goes backwards", async () => {
    const run = vi.fn(
      async (
        binary: string,
        _args: readonly string[],
        options?: { onStderr?: (chunk: string) => void },
      ) => {
        if (binary === "whisper-cli") {
          options?.onStderr?.("whisper_print_progress_callback: progress =  64%\n");
          options?.onStderr?.("whisper_print_progress_callback: progress =  64%\n");
          options?.onStderr?.("whisper_print_progress_callback: progress = 100%\n");
          options?.onStderr?.("whisper_print_progress_callback: progress =  25%\n");
        }
        return { stdout: "", stderr: "" };
      },
    );
    const onProgress = vi.fn();

    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run,
      stemFor: () => "/tmp/take",
      readOutput: async () => JSON_OUTPUT,
    });

    await provider.transcribe({ filePath: "/media/take.mp4" }, { onProgress });

    expect(onProgress.mock.calls.map((call) => call[0])).toEqual([0.05, 0.626, 0.95, 1]);
  });

  it("finds progress after many unrelated chunks with a bounded buffer", async () => {
    const run = vi.fn(
      async (
        binary: string,
        _args: readonly string[],
        options?: { onStderr?: (chunk: string) => void },
      ) => {
        if (binary === "whisper-cli") {
          for (let index = 0; index < 10_000; index += 1) {
            options?.onStderr?.("noise ");
          }
          options?.onStderr?.("whisper_print_progress_callback: progress =  4");
          options?.onStderr?.("2%\n");
        }
        return { stdout: "", stderr: "" };
      },
    );
    const onProgress = vi.fn();

    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run,
      stemFor: () => "/tmp/take",
      readOutput: async () => JSON_OUTPUT,
    });

    await provider.transcribe({ filePath: "/media/take.mp4" }, { onProgress });

    expect(onProgress.mock.calls.map((call) => call[0])).toEqual([0.05, 0.428, 1]);
  });

  it("passes the abort signal to the runner and reports cancellation", async () => {
    const controller = new AbortController();
    const run = vi.fn(async (binary: string) => {
      if (binary === "whisper-cli") {
        controller.abort();
        throw new Error("killed");
      }
      return { stdout: "", stderr: "" };
    });

    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run,
      stemFor: () => "/tmp/take",
      readOutput: async () => JSON_OUTPUT,
    });

    await expect(
      provider.transcribe({ filePath: "/media/take.mp4" }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "request-failed", message: "transcription cancelled" });
    expect(run).toHaveBeenNthCalledWith(
      2,
      "whisper-cli",
      WHISPER_ARGS,
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("removes the WAV after a whisper failure", async () => {
    const run = vi.fn(async (binary: string) => {
      if (binary === "whisper-cli") {
        throw new Error("model file not found");
      }
      return { stdout: "", stderr: "" };
    });
    const removeFile = vi.fn(async () => {});

    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run,
      stemFor: () => "/tmp/take",
      readOutput: async () => JSON_OUTPUT,
      removeFile,
    });

    await expect(provider.transcribe({ filePath: "/media/take.mp4" })).rejects.toThrow(
      /model file not found/,
    );
    expect(removeFile).toHaveBeenCalledWith("/tmp/take.wav");
  });

  it("reports a missing whisper binary as not configured", async () => {
    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run: async (binary: string) => {
        if (binary === "whisper-cli") {
          throw Object.assign(new Error("spawn whisper-cli ENOENT"), { code: "ENOENT" });
        }
        return { stdout: "", stderr: "" };
      },
      readOutput: async () => JSON_OUTPUT,
    });

    await expect(provider.transcribe({ filePath: "/media/take.mp4" })).rejects.toMatchObject({
      code: "not-configured",
      message: "the whisper-cli binary is not available",
    });
  });

  it("reports a missing ffmpeg binary as not configured", async () => {
    const removeFile = vi.fn(async () => {});
    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run: async (binary: string) => {
        if (binary === "ffmpeg") {
          throw Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
        }
        return { stdout: "", stderr: "" };
      },
      stemFor: () => "/tmp/take",
      readOutput: async () => JSON_OUTPUT,
      removeFile,
    });

    await expect(provider.transcribe({ filePath: "/media/take.mp4" })).rejects.toMatchObject({
      code: "not-configured",
      message: "the ffmpeg binary is not available",
    });
    expect(removeFile).toHaveBeenCalledWith("/tmp/take.wav");
  });

  it("reports a missing output file rather than returning nothing", async () => {
    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run: async () => ({ stdout: "", stderr: "" }),
      readOutput: async () => {
        throw new Error("ENOENT");
      },
    });

    await expect(provider.transcribe({ filePath: "/media/take.mp4" })).rejects.toBeInstanceOf(
      AiError,
    );
  });
});
