import { describe, expect, it } from "vitest";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import { ExportError } from "@verbal/media";
import { runExportJob } from "./export-job";

const now = () => new Date("2026-11-20T00:00:00.000Z");

async function makeRegistry() {
  const registry = await JobRegistry.open(createMemoryJobStore(), now);
  const job = await registry.create("export");
  return { registry, job };
}

describe("runExportJob", () => {
  it("completes the job with the work result", async () => {
    const { registry, job } = await makeRegistry();

    await runExportJob(registry, job.id, async () => ({ outputPath: "/out.mp4" }));

    expect(registry.get(job.id)).toMatchObject({
      status: "done",
      result: { outputPath: "/out.mp4" },
      progress: 1,
    });
  });

  it("records progress reported by the work", async () => {
    const { registry, job } = await makeRegistry();

    await runExportJob(registry, job.id, async (report) => {
      report(0.5, "encoding");
      return null;
    });

    expect(registry.get(job.id)?.message).toBe("encoding");
  });

  it("fails the job when the work throws", async () => {
    const { registry, job } = await makeRegistry();

    await runExportJob(registry, job.id, async () => {
      throw new Error("ffmpeg exploded");
    });

    expect(registry.get(job.id)).toMatchObject({
      status: "failed",
      error: "ffmpeg exploded",
    });
  });

  it("cancels the job when the work reports cancellation", async () => {
    const { registry, job } = await makeRegistry();

    await runExportJob(registry, job.id, async () => {
      throw new ExportError("cancelled", "export cancelled");
    });

    expect(registry.get(job.id)?.status).toBe("cancelled");
  });

  it("passes an abort signal to the work", async () => {
    const { registry, job } = await makeRegistry();
    let sawSignal = false;

    await runExportJob(registry, job.id, async (_report, signal) => {
      sawSignal = signal instanceof AbortSignal;
      return null;
    });

    expect(sawSignal).toBe(true);
  });
});
