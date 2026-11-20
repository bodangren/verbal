import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { TranscriptionProvider } from "@verbal/ai";
import { createTranscribeService } from "./transcribe-service";
import { createFakeFileSystem } from "./test-support";

const ROOT = path.join(path.sep, "tmp", "verbal-local");

function projectFs() {
  const fs = createFakeFileSystem();
  fs.files.set(
    path.join(ROOT, "project.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "p1",
      name: "Local",
      createdAt: "2026-11-21T00:00:00.000Z",
      media: { externalPath: "/media/take.mp4" },
    }),
  );
  return fs;
}

const stubProvider: TranscriptionProvider = {
  id: "stub",
  async transcribe() {
    return { text: "hello", language: null, words: [{ text: "hello", start: 0, end: 0.5 }] };
  },
};

describe("createTranscribeService provider selection", () => {
  it("uses the local provider in local mode without an API key", async () => {
    const createLocalProvider = vi.fn(() => stubProvider);

    const service = createTranscribeService({
      fs: projectFs(),
      apiKey: () => "",
      asrMode: () => "local",
      whisperModelPath: () => "/models/ggml-base.bin",
      createLocalProvider,
    });

    await expect(service.transcribeNow(ROOT)).resolves.toBe(1);
    expect(createLocalProvider).toHaveBeenCalledWith({ modelPath: "/models/ggml-base.bin" });
  });

  it("requires an API key in the default mode", async () => {
    const service = createTranscribeService({
      fs: projectFs(),
      apiKey: () => "",
      asrMode: () => undefined,
    });

    await expect(service.transcribeNow(ROOT)).rejects.toMatchObject({ code: "not-configured" });
  });

  it("names the missing model in local mode", async () => {
    const service = createTranscribeService({
      fs: projectFs(),
      apiKey: () => "",
      asrMode: () => "local",
      whisperModelPath: () => undefined,
    });

    await expect(service.transcribeNow(ROOT)).rejects.toThrow(/VERBAL_WHISPER_MODEL/);
  });
});
