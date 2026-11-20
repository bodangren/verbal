import { describe, expect, it, vi } from "vitest";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import type { AssemblyStep } from "@verbal/compose";
import { runStoryboardExport } from "./storyboard-export";

const now = () => new Date("2026-11-20T00:00:00.000Z");

const plan: AssemblyStep[] = [
  { kind: "scene", sceneId: "s1", durationSeconds: 2 },
];

async function makeJob() {
  const registry = await JobRegistry.open(createMemoryJobStore(), now);
  const job = await registry.create("export");
  return { registry, job };
}

describe("runStoryboardExport", () => {
  it("assembles, writes provenance, and completes the job", async () => {
    const { registry, job } = await makeJob();
    const assemble = vi.fn(async () => ({ files: ["a.mp4", "b.mp4"] }));
    const writeProvenance = vi.fn(async () => "/out/manifest.json");

    await runStoryboardExport({
      registry,
      jobId: job.id,
      plan,
      outputPath: "/out/final.mp4",
      assemble,
      writeProvenance,
    });

    expect(assemble).toHaveBeenCalledTimes(1);
    expect(writeProvenance).toHaveBeenCalledTimes(1);
    expect(registry.get(job.id)).toMatchObject({
      status: "done",
      result: {
        outputPath: "/out/final.mp4",
        manifestPath: "/out/manifest.json",
        files: 2,
      },
    });
  });

  it("fails the job when assembly fails", async () => {
    const { registry, job } = await makeJob();

    await runStoryboardExport({
      registry,
      jobId: job.id,
      plan,
      outputPath: "/out/final.mp4",
      assemble: async () => {
        throw new Error("concat failed");
      },
      writeProvenance: async () => "/out/manifest.json",
    });

    expect(registry.get(job.id)).toMatchObject({
      status: "failed",
      error: "concat failed",
    });
  });

  it("does not write provenance when assembly fails", async () => {
    const { registry, job } = await makeJob();
    const writeProvenance = vi.fn(async () => "/out/manifest.json");

    await runStoryboardExport({
      registry,
      jobId: job.id,
      plan,
      outputPath: "/out/final.mp4",
      assemble: async () => {
        throw new Error("nope");
      },
      writeProvenance,
    });

    expect(writeProvenance).not.toHaveBeenCalled();
  });
});
