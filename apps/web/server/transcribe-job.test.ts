import { describe, expect, it, vi } from "vitest";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import type { TranscriptionProvider } from "@verbal/ai";
import { runTranscriptionJob } from "./transcribe-job";

const now = () => new Date("2026-11-20T00:00:00.000Z");

function provider(result: Awaited<ReturnType<TranscriptionProvider["transcribe"]>>): TranscriptionProvider {
  return {
    id: "fake",
    async transcribe() {
      return result;
    },
  };
}

async function makeRegistry() {
  const registry = await JobRegistry.open(createMemoryJobStore(), now);
  const job = await registry.create("transcribe");
  return { registry, job };
}

describe("runTranscriptionJob", () => {
  it("stores the transcript and completes the job", async () => {
    const { registry, job } = await makeRegistry();
    const onTranscript = vi.fn(async () => undefined);

    await runTranscriptionJob({
      registry,
      jobId: job.id,
      provider: provider({
        text: "hello",
        language: "en",
        words: [{ text: "hello", start: 0, end: 0.4 }],
      }),
      request: { filePath: "/media/a.mp4" },
      onTranscript,
    });

    expect(onTranscript).toHaveBeenCalledWith({
      text: "hello",
      language: "en",
      words: [{ text: "hello", start: 0, end: 0.4 }],
    });
    expect(registry.get(job.id)?.status).toBe("done");
  });

  it("forwards provider progress to the job", async () => {
    const { registry, job } = await makeRegistry();
    const progress = vi.spyOn(registry, "progress");
    const onProgress = vi.fn();
    const provider: TranscriptionProvider = {
      id: "fake",
      async transcribe(_request, options) {
        options?.onProgress?.(0.25);
        options?.onProgress?.(0.75);
        return {
          text: "hello",
          language: "en",
          words: [{ text: "hello", start: 0, end: 0.4 }],
        };
      },
    };

    await runTranscriptionJob({
      registry,
      jobId: job.id,
      provider,
      request: { filePath: "/media/a.mp4" },
      onTranscript: async () => undefined,
      onProgress,
    });

    expect(onProgress.mock.calls.map((call) => call[0])).toEqual([0.25, 0.75]);
    expect(progress.mock.calls.map((call) => call[1])).toEqual([0, 1]);
  });

  it("fails the job when the provider throws", async () => {
    const { registry, job } = await makeRegistry();

    await runTranscriptionJob({
      registry,
      jobId: job.id,
      provider: {
        id: "bad",
        async transcribe() {
          throw new Error("rate limited");
        },
      },
      request: { filePath: "/media/a.mp4" },
      onTranscript: async () => undefined,
    });

    expect(registry.get(job.id)).toMatchObject({
      status: "failed",
      error: "rate limited",
    });
  });

  it("does not store a transcript when the job fails", async () => {
    const { registry, job } = await makeRegistry();
    const onTranscript = vi.fn(async () => undefined);

    await runTranscriptionJob({
      registry,
      jobId: job.id,
      provider: {
        id: "bad",
        async transcribe() {
          throw new Error("nope");
        },
      },
      request: { filePath: "/media/a.mp4" },
      onTranscript,
    });

    expect(onTranscript).not.toHaveBeenCalled();
  });
});
