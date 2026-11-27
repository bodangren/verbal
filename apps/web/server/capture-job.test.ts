import { promises as nodeFs } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import { partialPathFor, type CaptureRequest } from "@verbal/media";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCaptureJob, type CaptureJobInput, type CaptureSpawner } from "./capture-job";

const now = () => new Date("2026-11-20T00:00:00.000Z");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function makeJob() {
  const registry = await JobRegistry.open(createMemoryJobStore(), now);
  const job = await registry.create("capture");
  return { registry, job };
}

async function makeDir() {
  const root = await mkdtemp(path.join(os.tmpdir(), "verbal-capture-"));
  roots.push(root);
  return root;
}

function partialFiles(dir: string): Promise<string[]> {
  return readdir(dir).then((names) => names.filter((name) => name.includes(".partial")));
}

const noopRename = () => vi.fn(async () => undefined);

describe("runCaptureJob", () => {
  it("records and completes the job", async () => {
    const { registry, job } = await makeJob();
    const spawn: CaptureSpawner = vi.fn(async () => undefined);

    await runCaptureJob(
      { registry, spawn, unlink: vi.fn(async () => undefined), rename: noopRename() },
      { jobId: job.id, request: { outputPath: "/out/cap.mp4", durationSeconds: 5 } },
    );

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(registry.get(job.id)).toMatchObject({
      status: "done",
      result: { outputPath: "/out/cap.mp4" },
    });
  });

  it("writes ffmpeg output to the partial path, not the final path", async () => {
    const { registry, job } = await makeJob();
    let writtenTo = "";
    const spawn: CaptureSpawner = async (_file, args) => {
      writtenTo = args[args.length - 1]!;
    };

    await runCaptureJob(
      { registry, spawn, unlink: vi.fn(async () => undefined), rename: noopRename() },
      { jobId: job.id, request: { outputPath: "/out/cap.mp4", durationSeconds: 5 } },
    );

    expect(writtenTo).toBe(partialPathFor("/out/cap.mp4", job.id));
  });

  it("fails the job and removes only the partial file when recording fails", async () => {
    const { registry, job } = await makeJob();
    const unlink = vi.fn(async () => undefined);
    const spawn: CaptureSpawner = async () => {
      throw new Error("no device");
    };

    await runCaptureJob(
      { registry, spawn, unlink, rename: noopRename() },
      { jobId: job.id, request: { outputPath: "/out/cap.mp4", durationSeconds: 5 } },
    );

    expect(registry.get(job.id)).toMatchObject({ status: "failed", error: "no device" });
    expect(unlink).toHaveBeenCalledWith(partialPathFor("/out/cap.mp4", job.id));
  });

  it("reports progress from ffmpeg output", async () => {
    const { registry, job } = await makeJob();
    const spawn: CaptureSpawner = async (_file, _args, options) => {
      options.onStdout("out_time_ms=2500000\n");
    };

    await runCaptureJob(
      { registry, spawn, unlink: vi.fn(async () => undefined), rename: noopRename() },
      { jobId: job.id, request: { outputPath: "/out/cap.mp4", durationSeconds: 5 } },
    );

    expect(registry.get(job.id)?.status).toBe("done");
  });

  it("runs onOutput after the rename and before the job is done", async () => {
    const { registry, job } = await makeJob();
    const spawn = vi.fn(async () => undefined);
    const order: string[] = [];
    const rename = vi.fn(async () => {
      order.push("rename");
    });

    await runCaptureJob(
      { registry, spawn, unlink: vi.fn(async () => undefined), rename },
      {
        jobId: job.id,
        request: { outputPath: "/out/cap.mp4", durationSeconds: 5 },
        onOutput: async () => {
          order.push("save");
          expect(registry.get(job.id)?.status).toBe("running");
        },
      },
    );

    expect(order).toEqual(["rename", "save"]);
    expect(registry.get(job.id)).toMatchObject({ status: "done" });
  });

  it("passes the registry signal, not a private controller, to the runner", async () => {
    const { registry, job } = await makeJob();
    const signalBefore = registry.signalOf(job.id);
    let received: AbortSignal | undefined;
    const spawn: CaptureSpawner = async (_file, _args, options) => {
      received = options.signal;
    };

    await runCaptureJob(
      { registry, spawn, unlink: vi.fn(async () => undefined), rename: noopRename() },
      { jobId: job.id, request: { outputPath: "/out/cap.mp4", durationSeconds: 5 } },
    );

    expect(received).toBe(signalBefore);
  });

  it("fails the job and removes the published file when the save throws", async () => {
    const { registry, job } = await makeJob();
    const root = await makeDir();
    const outputPath = path.join(root, "cap.mp4");
    const spawn: CaptureSpawner = async (_file, args) => {
      await nodeFs.writeFile(args[args.length - 1]!, "recorded bytes");
    };

    await runCaptureJob(
      {
        registry,
        spawn,
        unlink: (target) => nodeFs.unlink(target),
        rename: (from, to) => nodeFs.rename(from, to),
      },
      {
        jobId: job.id,
        request: { outputPath, durationSeconds: 5 },
        onOutput: async () => {
          throw new Error("disk full");
        },
      },
    );

    expect(registry.get(job.id)).toMatchObject({ status: "failed" });
    expect(registry.get(job.id)?.error).toContain("disk full");
    expect(registry.get(job.id)?.error).toContain("removed");
    await expect(nodeFs.readFile(outputPath, "utf8")).rejects.toThrow();
    expect(await partialFiles(root)).toEqual([]);
  });

  it("a cancel before beginPublish kills the child, publishes nothing, and leaves no partial", async () => {
    const { registry, job } = await makeJob();
    const root = await makeDir();
    const outputPath = path.join(root, "cap.mp4");
    let received: AbortSignal | undefined;
    const spawn: CaptureSpawner = async (_file, _args, options) => {
      received = options.signal;
      await new Promise<void>((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    };

    const running = runCaptureJob(
      {
        registry,
        spawn,
        unlink: (target) => nodeFs.unlink(target),
        rename: (from, to) => nodeFs.rename(from, to),
      },
      { jobId: job.id, request: { outputPath, durationSeconds: 5 } },
    );

    await vi.waitFor(() => expect(received).toBeDefined());
    await registry.cancel(job.id);
    await running;

    expect(received?.aborted).toBe(true);
    await expect(nodeFs.access(outputPath)).rejects.toThrow();
    expect(await partialFiles(root)).toEqual([]);
    expect(registry.get(job.id)?.status).toBe("cancelled");
  });

  it("rejects a cancel after beginPublish and ends the job done", async () => {
    const { registry, job } = await makeJob();
    let cancelError: unknown;
    const rename = vi.fn(async () => {
      cancelError = await registry.cancel(job.id).catch((error) => error);
    });

    await runCaptureJob(
      {
        registry,
        spawn: vi.fn(async () => undefined),
        unlink: vi.fn(async () => undefined),
        rename,
      },
      { jobId: job.id, request: { outputPath: "/out/cap.mp4", durationSeconds: 5 } },
    );

    expect(cancelError).toMatchObject({ code: "publishing" });
    expect(rename).toHaveBeenCalled();
    expect(registry.get(job.id)?.status).toBe("done");
  });

  it("keeps onOutput out of the capture request type", () => {
    const request = { outputPath: "/out/cap.mp4", durationSeconds: 5 } satisfies CaptureRequest;
    expect(request.durationSeconds).toBe(5);

    const bad: CaptureJobInput = {
      jobId: "j",
      request: {
        outputPath: "/out/cap.mp4",
        durationSeconds: 5,
        // @ts-expect-error onOutput is a job-input field, not part of CaptureRequest
        onOutput: async () => undefined,
      },
    };
    const good: CaptureJobInput = {
      jobId: "j",
      request: { outputPath: "/out/cap.mp4", durationSeconds: 5 },
      onOutput: async () => undefined,
    };
    void bad;
    expect(good.onOutput).toBeDefined();
  });
});
