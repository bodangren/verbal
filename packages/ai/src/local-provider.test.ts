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

describe("buildLocalArgs", () => {
  it("passes every value as its own argument", () => {
    expect(
      buildLocalArgs({
        modelPath: "/models/ggml-base.bin",
        filePath: "/media/take.mp4",
        outputStem: "/tmp/take",
      }),
    ).toEqual([
      "-m",
      "/models/ggml-base.bin",
      "-f",
      "/media/take.mp4",
      "-oj",
      "-of",
      "/tmp/take",
    ]);
  });
});

describe("createLocalWhisperProvider", () => {
  it("runs the binary and parses its output", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));

    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run,
      stemFor: () => "/tmp/take",
      readOutput: async () => JSON_OUTPUT,
    });

    const result = await provider.transcribe({ filePath: "/media/take.mp4" });

    expect(provider.id).toBe("local-whisper");
    expect(run).toHaveBeenCalledWith("whisper-cli", [
      "-m",
      "/models/ggml-base.bin",
      "-f",
      "/media/take.mp4",
      "-oj",
      "-of",
      "/tmp/take",
    ]);
    expect(result.words.map((word) => word.text)).toEqual(["hello", "world"]);
    expect(result.language).toBe("en");
  });

  it("reports a missing binary as not configured", async () => {
    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run: async () => {
        throw Object.assign(new Error("spawn whisper-cli ENOENT"), { code: "ENOENT" });
      },
      readOutput: async () => JSON_OUTPUT,
    });

    await expect(provider.transcribe({ filePath: "/media/take.mp4" })).rejects.toMatchObject({
      code: "not-configured",
    });
  });

  it("reports a failed run with the CLI's message", async () => {
    const provider = createLocalWhisperProvider({
      modelPath: "/models/ggml-base.bin",
      run: async () => {
        throw new Error("model file not found");
      },
      readOutput: async () => JSON_OUTPUT,
    });

    await expect(provider.transcribe({ filePath: "/media/take.mp4" })).rejects.toThrow(
      /model file not found/,
    );
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
