import { afterEach, describe, expect, it, vi } from "vitest";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import { createBatchProgressWriter } from "./batch-progress";

describe("batch progress cancellation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not emit an unhandled rejection when a progress write rejects after cancel", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore());
    const job = await registry.create("transcribe");
    await registry.start(job.id);
    const signal = registry.signalOf(job.id)!;
    const writer = createBatchProgressWriter(registry, job.id, signal);
    let rejectProgress!: (error: Error) => void;
    vi.spyOn(registry, "progress").mockImplementation(
      () => new Promise((_resolve, reject) => { rejectProgress = reject; }),
    );
    const unhandled: unknown[] = [];
    const listener = (error: unknown) => unhandled.push(error);
    process.on("unhandledRejection", listener);

    try {
      writer.report({ root: "/p", status: "transcribed" }, 1, 1);
      await vi.waitFor(() => expect(rejectProgress).toBeDefined());
      await registry.cancel(job.id);
      rejectProgress(new Error("cancelled"));
      await writer.flush();
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener("unhandledRejection", listener);
    }
  });
});
