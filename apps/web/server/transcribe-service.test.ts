import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AsrResolution } from "./asr-resolve";
import type { TranscriptionProvider } from "@verbal/ai";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import {
  createTranscribeService,
  describeTranscriptionProvider,
} from "./transcribe-service";
import { createFakeFileSystem } from "./test-support";

const ROOT = path.join(path.sep, "tmp", "verbal-local");
const DATA = path.join(path.sep, "data", "verbal");

const LOCAL: AsrResolution = {
  mode: "local",
  binary: "/bin/whisper-cli",
  modelPath: "/models/ggml-small.bin",
  modelName: "small",
  language: "th",
};
const CLOUD: AsrResolution = { mode: "cloud" };
const NONE: AsrResolution = { mode: "none", missing: "both" };

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
  it("uses the local resolver without an API key", async () => {
    const createLocalProvider = vi.fn(() => stubProvider);
    const createProvider = vi.fn(() => stubProvider);

    const service = createTranscribeService({
      fs: projectFs(),
      apiKey: () => "",
      resolveAsr: () => LOCAL,
      createLocalProvider,
      createProvider,
    });

    await expect(service.transcribeNow(ROOT)).resolves.toBe(1);
    expect(createLocalProvider).toHaveBeenCalledWith({
      modelPath: "/models/ggml-small.bin",
      binary: "/bin/whisper-cli",
      language: "th",
    });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("requires an API key in cloud mode", async () => {
    const service = createTranscribeService({
      fs: projectFs(),
      apiKey: () => "",
      resolveAsr: () => CLOUD,
    });

    await expect(service.transcribeNow(ROOT)).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("uses the cloud provider when a key is set", async () => {
    const createProvider = vi.fn(() => stubProvider);
    const service = createTranscribeService({
      fs: projectFs(),
      apiKey: () => "key",
      baseUrl: () => "https://example.test/v1",
      resolveAsr: () => CLOUD,
      createProvider,
    });

    await expect(service.transcribeNow(ROOT)).resolves.toBe(1);
    expect(createProvider).toHaveBeenCalledWith({
      apiKey: "key",
      baseUrl: "https://example.test/v1",
    });
  });

  it("names the data directory when no speech engine is set up", async () => {
    const service = createTranscribeService({
      fs: projectFs(),
      apiKey: () => "",
      resolveAsr: () => NONE,
      dataDir: () => DATA,
    });

    await expect(service.transcribeNow(ROOT)).rejects.toMatchObject({
      code: "not-configured",
      message: `no speech engine is set up: install whisper-cli and a model in ${DATA}, or set OPENAI_API_KEY`,
    });
  });
});

describe("transcription job progress", () => {
  it("writes rising job progress from the provider", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore());
    const progress = vi.spyOn(registry, "progress");
    const provider: TranscriptionProvider = {
      id: "fake",
      async transcribe(_request, options) {
        for (const fraction of [0.05, 0.26, 0.64, 0.95, 1]) {
          options?.onProgress?.(fraction);
        }
        return { text: "hello", language: null, words: [{ text: "hello", start: 0, end: 0.5 }] };
      },
    };

    const service = createTranscribeService({
      fs: projectFs(),
      apiKey: () => "key",
      resolveAsr: () => CLOUD,
      createProvider: () => provider,
      registry: async () => registry,
    });

    const job = await service.start(ROOT);
    for (let attempt = 0; attempt < 100 && registry.get(job.id)?.status !== "done"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(registry.get(job.id)?.status).toBe("done");
    const values = progress.mock.calls.map((call) => call[1]);
    expect(values).toEqual([...values].sort((left, right) => left - right));
    expect(new Set(values).size).toBeGreaterThan(3);
    expect(progress.mock.calls.map((call) => call[2])).toContain("Extracting audio…");
    expect(progress.mock.calls.map((call) => call[2])).toContain("Transcribing audio…");
  });

  it("says Transcribing as soon as extraction is done", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore());
    const progress = vi.spyOn(registry, "progress");
    const provider: TranscriptionProvider = {
      id: "fake",
      async transcribe(_request, options) {
        // The local provider reports 0.05 once ffmpeg has written the audio.
        options?.onProgress?.(0.05);
        return { text: "hello", language: null, words: [{ text: "hello", start: 0, end: 0.5 }] };
      },
    };

    const service = createTranscribeService({
      fs: projectFs(),
      apiKey: () => "key",
      resolveAsr: () => CLOUD,
      createProvider: () => provider,
      registry: async () => registry,
    });

    const job = await service.start(ROOT);
    for (let attempt = 0; attempt < 100 && registry.get(job.id)?.status !== "done"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const atFivePercent = progress.mock.calls.filter((call) => call[1] === 0.05);
    expect(atFivePercent.map((call) => call[2])).toEqual(["Transcribing audio…"]);
  });
});

describe("describeTranscriptionProvider", () => {
  it("names the local model", () => {
    expect(describeTranscriptionProvider(LOCAL)).toEqual({
      mode: "local",
      label: "Local (whisper small)",
      cloud: false,
    });
  });

  it("names the cloud provider", () => {
    expect(describeTranscriptionProvider(CLOUD)).toEqual({
      mode: "cloud",
      label: "Cloud (OpenAI-compatible)",
      cloud: true,
    });
  });

  it("names a missing engine and adds an install hint", () => {
    expect(describeTranscriptionProvider(NONE)).toEqual({
      mode: "none",
      label: "No speech engine",
      cloud: false,
      hint: "Install whisper (see README, Transcription setup) or set OPENAI_API_KEY.",
    });
  });
});
