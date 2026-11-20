import { describe, expect, it, vi } from "vitest";
import {
  JobError,
  JobRegistry,
  createMemoryJobStore,
  type JobRecord,
} from "./jobs";

const now = () => new Date("2026-11-20T00:00:00.000Z");

function runningJob(): JobRecord {
  return {
    id: "job-running",
    kind: "export",
    status: "running",
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    progress: 0.4,
    message: "encoding",
    result: null,
    error: null,
  };
}

describe("JobRegistry", () => {
  it("creates a queued job and persists it", async () => {
    const store = createMemoryJobStore();
    const registry = await JobRegistry.open(store, now);

    const job = await registry.create("export");

    expect(job.status).toBe("queued");
    expect(job.progress).toBe(0);
    expect(store.snapshot()).toHaveLength(1);
  });

  it("reloads persisted jobs when reopened", async () => {
    const store = createMemoryJobStore();
    const first = await JobRegistry.open(store, now);
    const job = await first.create("probe");

    const second = await JobRegistry.open(store, now);

    expect(second.list().map((entry) => entry.id)).toEqual([job.id]);
  });

  it("moves a queued job to running", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const job = await registry.create("export");

    const started = await registry.start(job.id);

    expect(started.status).toBe("running");
    expect(registry.get(job.id)?.status).toBe("running");
  });

  it("records progress and clamps it to 0..1", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const job = await registry.create("export");
    await registry.start(job.id);

    expect((await registry.progress(job.id, 0.25, "half")).progress).toBe(0.25);
    expect((await registry.progress(job.id, 4)).progress).toBe(1);
    expect((await registry.progress(job.id, -2)).progress).toBe(0);
    expect(registry.get(job.id)?.message).toBe("half");
  });

  it("completes a running job with a result", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const job = await registry.create("export");
    await registry.start(job.id);

    const done = await registry.complete(job.id, { output: "/out.mp4" });

    expect(done.status).toBe("done");
    expect(done.result).toEqual({ output: "/out.mp4" });
    expect(done.progress).toBe(1);
  });

  it("fails a running job with an error message", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const job = await registry.create("export");
    await registry.start(job.id);

    const failed = await registry.fail(job.id, "ffmpeg exited with 1");

    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("ffmpeg exited with 1");
  });

  it("cancels a queued or running job", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const queued = await registry.create("probe");
    const running = await registry.create("export");
    await registry.start(running.id);

    expect((await registry.cancel(queued.id)).status).toBe("cancelled");
    expect((await registry.cancel(running.id)).status).toBe("cancelled");
  });

  it("rejects an illegal transition", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const job = await registry.create("export");
    await registry.start(job.id);
    await registry.complete(job.id);

    await expect(registry.start(job.id)).rejects.toBeInstanceOf(JobError);
    await expect(registry.start(job.id)).rejects.toMatchObject({
      code: "illegal-transition",
    });
  });

  it("rejects progress on a queued job", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const job = await registry.create("export");

    await expect(registry.progress(job.id, 0.5)).rejects.toMatchObject({
      code: "illegal-transition",
    });
  });

  it("reports an unknown job as not-found", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);

    await expect(registry.start("nope")).rejects.toMatchObject({ code: "not-found" });
    await expect(registry.cancel("nope")).rejects.toMatchObject({ code: "not-found" });
  });

  it("marks jobs interrupted by a restart as failed", async () => {
    const store = createMemoryJobStore([runningJob()]);
    const registry = await JobRegistry.open(store, now);

    const job = registry.get("job-running");

    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("interrupted");
    expect(store.snapshot()[0]?.status).toBe("failed");
  });

  it("notifies subscribers on every change", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    const job = await registry.create("export");
    expect(listener).toHaveBeenCalledTimes(1);

    await registry.start(job.id);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await registry.complete(job.id);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
