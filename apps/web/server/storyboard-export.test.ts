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
      rename: vi.fn(async () => undefined),
      unlink: vi.fn(async () => undefined),
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

  it("concatenates into a partial path and renames it over the destination", async () => {
    const { registry, job } = await makeJob();
    const assemble = vi.fn(async () => ({ files: [] }));
    const writeProvenance = vi.fn(async () => "/out/manifest.json");
    const rename = vi.fn(async () => undefined);

    await runStoryboardExport({
      registry,
      jobId: job.id,
      plan,
      outputPath: "/out/final.mp4",
      assemble,
      writeProvenance,
      rename,
      unlink: vi.fn(async () => undefined),
    });

    expect(assemble).toHaveBeenCalledWith(plan, `/out/final.${job.id}.partial.mp4`, expect.anything(), expect.anything());
    expect(rename).toHaveBeenCalledWith(`/out/final.${job.id}.partial.mp4`, "/out/final.mp4");
  });

  it("renames before it writes provenance", async () => {
    const { registry, job } = await makeJob();
    const events: string[] = [];
    const rename = vi.fn(async () => {
      events.push("rename");
    });
    const writeProvenance = vi.fn(async () => {
      events.push("provenance");
      return "/out/manifest.json";
    });

    await runStoryboardExport({
      registry,
      jobId: job.id,
      plan,
      outputPath: "/out/final.mp4",
      assemble: vi.fn(async () => ({ files: [] })),
      writeProvenance,
      rename,
      unlink: vi.fn(async () => undefined),
    });

    expect(events).toEqual(["rename", "provenance"]);
  });

  it("fails the job when assembly fails", async () => {
    const { registry, job } = await makeJob();
    const unlink = vi.fn(async () => undefined);

    await runStoryboardExport({
      registry,
      jobId: job.id,
      plan,
      outputPath: "/out/final.mp4",
      assemble: async () => {
        throw new Error("concat failed");
      },
      writeProvenance: async () => "/out/manifest.json",
      unlink,
    });

    expect(registry.get(job.id)).toMatchObject({
      status: "failed",
      error: "concat failed",
    });
    expect(unlink).toHaveBeenCalledWith(`/out/final.${job.id}.partial.mp4`);
  });

  it("does not write provenance when assembly fails", async () => {
    const { registry, job } = await makeJob();
    const writeProvenance = vi.fn(async () => "/out/manifest.json");
    const rename = vi.fn(async () => undefined);

    await runStoryboardExport({
      registry,
      jobId: job.id,
      plan,
      outputPath: "/out/final.mp4",
      assemble: async () => {
        throw new Error("nope");
      },
      writeProvenance,
      rename,
      unlink: vi.fn(async () => undefined),
    });

    expect(writeProvenance).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
  });

  it("a cancel before publish skips the rename and removes the partial", async () => {
    const { registry, job } = await makeJob();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const assemble = vi.fn(async () => {
      await blocked;
      return { files: [] };
    });
    const rename = vi.fn(async () => undefined);
    const unlink = vi.fn(async () => undefined);

    const running = runStoryboardExport({
      registry,
      jobId: job.id,
      plan,
      outputPath: "/out/final.mp4",
      assemble,
      writeProvenance: vi.fn(async () => "/out/manifest.json"),
      rename,
      unlink,
    });

    await vi.waitFor(() => expect(assemble).toHaveBeenCalled());
    await registry.cancel(job.id);
    release();
    await running;

    expect(rename).not.toHaveBeenCalled();
    expect(unlink).toHaveBeenCalledWith(`/out/final.${job.id}.partial.mp4`);
    expect(registry.get(job.id)?.status).toBe("cancelled");
  });

  it("rejects a cancel that arrives after beginPublish and ends the job done", async () => {
    const { registry, job } = await makeJob();
    let cancelError: unknown;
    const rename = vi.fn(async () => {
      cancelError = await registry.cancel(job.id).catch((error) => error);
    });

    await runStoryboardExport({
      registry,
      jobId: job.id,
      plan,
      outputPath: "/out/final.mp4",
      assemble: vi.fn(async () => ({ files: [] })),
      writeProvenance: vi.fn(async () => "/out/manifest.json"),
      rename,
      unlink: vi.fn(async () => undefined),
    });

    expect(cancelError).toMatchObject({ code: "publishing" });
    expect(rename).toHaveBeenCalled();
    expect(registry.get(job.id)?.status).toBe("done");
  });
});
