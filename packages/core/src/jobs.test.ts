import { describe, expect, it, vi } from "vitest";
import type { FileSystem } from "./atomic";
import {
  JobError,
  JobRegistry,
  createFileJobStore,
  createMemoryJobStore,
  type JobRecord,
  type JobStore,
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

function queuedJob(): JobRecord {
  return {
    id: "job-queued",
    kind: "transcribe",
    status: "queued",
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    progress: 0,
    message: null,
    result: null,
    error: null,
  };
}

const jobsFile = "/data/jobs.json";

function memoryFsWithJobs(jobs: readonly JobRecord[]): FileSystem {
  const files = new Map<string, string>([[jobsFile, `${JSON.stringify(jobs, null, 2)}\n`]]);

  return {
    async mkdir() {},
    async readFile(target) {
      const contents = files.get(target);
      if (contents === undefined) {
        const error = new Error(`ENOENT: ${target}`) as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return contents;
    },
    async writeFileDurable(target, data) {
      files.set(target, data);
    },
    async rename(from, to) {
      const contents = files.get(from);
      if (contents === undefined) {
        throw new Error(`ENOENT: ${from}`);
      }
      files.delete(from);
      files.set(to, contents);
    },
    async unlink(target) {
      files.delete(target);
    },
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

  it("aborts the signal owned by a cancelled job", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const job = await registry.create("export");
    const signal = registry.signalOf(job.id);

    await registry.cancel(job.id);

    expect(signal?.aborted).toBe(true);
  });

  it("removes terminal job controllers after cancellation", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const cancelled = await registry.create("export");
    const completed = await registry.create("export");
    const failed = await registry.create("export");
    await registry.start(completed.id);
    await registry.start(failed.id);

    await registry.cancel(cancelled.id);
    await registry.complete(completed.id);
    await registry.fail(failed.id, "failed");

    expect(registry.signalOf(cancelled.id)).toBeUndefined();
    expect(registry.signalOf(completed.id)).toBeUndefined();
    expect(registry.signalOf(failed.id)).toBeUndefined();
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
    expect(job?.error).toBe("server restarted");
    expect(store.snapshot()[0]?.status).toBe("failed");
  });

  it("marks running and queued jobs failed after a restart", async () => {
    const store = createFileJobStore(memoryFsWithJobs([runningJob(), queuedJob()]), jobsFile);

    const registry = await JobRegistry.open(store, now);

    expect(registry.get("job-running")?.status).toBe("failed");
    expect(registry.get("job-running")?.error).toBe("server restarted");
    expect(registry.get("job-queued")?.status).toBe("failed");
    expect(registry.get("job-queued")?.error).toBe("server restarted");

    const persisted = await store.load();
    expect(persisted.map((job) => job.status)).toEqual(["failed", "failed"]);
    expect(persisted.map((job) => job.error)).toEqual(["server restarted", "server restarted"]);
  });

  it("writes ten parallel updates in call order", async () => {
    let records: JobRecord[] = [];
    const store: JobStore = {
      async load() {
        return [...records];
      },
      async save(jobs) {
        const delay = jobs[0]?.message === "step 9" ? 0 : 1 + Math.random() * 20;
        await new Promise((resolve) => setTimeout(resolve, delay));
        records = [...jobs];
      },
    };

    const registry = await JobRegistry.open(store, now);
    const job = await registry.create("export");
    await registry.start(job.id);

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        registry.progress(job.id, index / 10, `step ${index}`),
      ),
    );

    expect(records[0]?.message).toBe("step 9");
    expect(records[0]?.progress).toBe(0.9);
  });

  it("keeps saving after a save fails", async () => {
    let records: JobRecord[] = [];
    let calls = 0;
    const store: JobStore = {
      async load() {
        return [...records];
      },
      async save(jobs) {
        calls += 1;
        if (calls === 2) {
          throw new Error("disk full");
        }
        records = [...jobs];
      },
    };

    const registry = await JobRegistry.open(store, now);
    const job = await registry.create("export");

    await expect(registry.start(job.id)).rejects.toThrow("disk full");
    await registry.fail(job.id, "boom");

    expect(registry.get(job.id)?.status).toBe("failed");
    expect(records[0]?.status).toBe("failed");
    expect(records[0]?.error).toBe("boom");
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

  it("returns false from beginPublish after a cancel", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const job = await registry.create("export");
    await registry.start(job.id);

    await registry.cancel(job.id);

    expect(registry.beginPublish(job.id)).toBe(false);
  });

  it("rejects a cancel after beginPublish and lets the job end done", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const job = await registry.create("export");
    await registry.start(job.id);

    expect(registry.beginPublish(job.id)).toBe(true);
    await expect(registry.cancel(job.id)).rejects.toMatchObject({
      code: "publishing",
      message: "The job is already publishing its result.",
    });
    expect(registry.get(job.id)?.status).toBe("running");

    const done = await registry.complete(job.id, { output: "/out.mp4" });
    expect(done.status).toBe("done");
  });

  it("returns false from beginPublish on a finished job", async () => {
    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const job = await registry.create("export");
    await registry.start(job.id);
    await registry.complete(job.id);

    expect(registry.beginPublish(job.id)).toBe(false);
  });
});
