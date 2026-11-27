import { promises as nodeFs } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import { partialPathFor } from "@verbal/media";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptureSpawner } from "./capture-job";
import { runAssemblyJob } from "./assembly-job";

const now = () => new Date("2026-11-20T00:00:00.000Z");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

const ranges = [
  { takeId: "take-1", startSeconds: 0, endSeconds: 2 },
  { takeId: "take-1", startSeconds: 4, endSeconds: 6 },
];

async function makeJob() {
  const registry = await JobRegistry.open(createMemoryJobStore(), now);
  const job = await registry.create("capture");
  return { registry, job };
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "verbal-assembly-"));
  roots.push(root);
  const workDir = path.join(root, "takes", ".assembly-job");
  const outputPath = path.join(root, "assets", "cut.mp4");
  await nodeFs.mkdir(path.join(root, "assets"), { recursive: true });
  return { root, workDir, outputPath };
}

function partialFiles(dir: string): Promise<string[]> {
  return readdir(dir).then((names) => names.filter((name) => name.includes(".partial")));
}

describe("runAssemblyJob", () => {
  it("cuts each range, concatenates into the partial, and completes", async () => {
    const { registry, job } = await makeJob();
    const { workDir, outputPath } = await setup();
    const spawnArgs: string[][] = [];
    const spawn: CaptureSpawner = async (_file, args) => {
      spawnArgs.push([...args]);
    };

    await runAssemblyJob(
      {
        registry,
        spawn,
        mkdir: async (target) => {
          await nodeFs.mkdir(target, { recursive: true });
        },
        writeFile: (target, data) => nodeFs.writeFile(target, data),
        unlink: (target) => nodeFs.unlink(target),
        rename: vi.fn(async () => undefined),
      },
      {
        jobId: job.id,
        ranges,
        takePath: "/p/take-1.mp4",
        outputPath,
        workDir,
        width: 640,
        height: 360,
        fps: 30,
      },
    );

    expect(spawnArgs).toHaveLength(3);
    expect(spawnArgs.some((args) => args.includes("-ss"))).toBe(true);
    const concat = spawnArgs.find((args) => args.includes("concat"));
    expect(concat).toBeDefined();
    expect(concat![concat!.length - 1]).toBe(partialPathFor(outputPath, job.id));
    expect(registry.get(job.id)).toMatchObject({
      status: "done",
      result: { outputPath, ranges: 2 },
    });
  });

  it("fails the job and leaves an existing output byte-identical when a cut fails", async () => {
    const { registry, job } = await makeJob();
    const { workDir, outputPath } = await setup();
    await nodeFs.writeFile(outputPath, "old cut bytes");
    const spawn: CaptureSpawner = async () => {
      throw new Error("ffmpeg failed");
    };

    await runAssemblyJob(
      {
        registry,
        spawn,
        mkdir: async (target) => {
          await nodeFs.mkdir(target, { recursive: true });
        },
        writeFile: (target, data) => nodeFs.writeFile(target, data),
        unlink: (target) => nodeFs.unlink(target),
        rename: (from, to) => nodeFs.rename(from, to),
      },
      {
        jobId: job.id,
        ranges,
        takePath: "/p/take-1.mp4",
        outputPath,
        workDir,
        width: 640,
        height: 360,
        fps: 30,
      },
    );

    expect(await nodeFs.readFile(outputPath, "utf8")).toBe("old cut bytes");
    expect(await partialFiles(path.dirname(outputPath))).toEqual([]);
    expect(registry.get(job.id)).toMatchObject({ status: "failed", error: "ffmpeg failed" });
  });

  it("removes only the partial when the concat fails", async () => {
    const { registry, job } = await makeJob();
    const { workDir, outputPath } = await setup();
    await nodeFs.writeFile(outputPath, "old cut bytes");
    const spawn: CaptureSpawner = async (_file, args) => {
      if (args.includes("concat")) {
        await nodeFs.writeFile(args[args.length - 1]!, "partial bytes");
        throw new Error("concat failed");
      }
    };

    await runAssemblyJob(
      {
        registry,
        spawn,
        mkdir: async (target) => {
          await nodeFs.mkdir(target, { recursive: true });
        },
        writeFile: (target, data) => nodeFs.writeFile(target, data),
        unlink: (target) => nodeFs.unlink(target),
        rename: (from, to) => nodeFs.rename(from, to),
      },
      {
        jobId: job.id,
        ranges,
        takePath: "/p/take-1.mp4",
        outputPath,
        workDir,
        width: 640,
        height: 360,
        fps: 30,
      },
    );

    expect(await nodeFs.readFile(outputPath, "utf8")).toBe("old cut bytes");
    expect(await partialFiles(path.dirname(outputPath))).toEqual([]);
    expect(registry.get(job.id)).toMatchObject({ status: "failed", error: "concat failed" });
  });

  it("renames the partial over the destination on success", async () => {
    const { registry, job } = await makeJob();
    const { workDir, outputPath } = await setup();
    const spawn: CaptureSpawner = async (_file, args) => {
      await nodeFs.writeFile(args[args.length - 1]!, "segment bytes");
    };

    await runAssemblyJob(
      {
        registry,
        spawn,
        mkdir: async (target) => {
          await nodeFs.mkdir(target, { recursive: true });
        },
        writeFile: (target, data) => nodeFs.writeFile(target, data),
        unlink: (target) => nodeFs.unlink(target),
        rename: (from, to) => nodeFs.rename(from, to),
      },
      {
        jobId: job.id,
        ranges,
        takePath: "/p/take-1.mp4",
        outputPath,
        workDir,
        width: 640,
        height: 360,
        fps: 30,
      },
    );

    expect(await nodeFs.readFile(outputPath, "utf8")).toBe("segment bytes");
    expect(await partialFiles(path.dirname(outputPath))).toEqual([]);
  });

  it("passes the registry signal, not a private controller, to the runner", async () => {
    const { registry, job } = await makeJob();
    const { workDir, outputPath } = await setup();
    const signalBefore = registry.signalOf(job.id);
    let received: AbortSignal | undefined;
    const spawn: CaptureSpawner = async (_file, _args, options) => {
      received = options.signal;
    };

    await runAssemblyJob(
      {
        registry,
        spawn,
        mkdir: async (target) => {
          await nodeFs.mkdir(target, { recursive: true });
        },
        writeFile: (target, data) => nodeFs.writeFile(target, data),
        unlink: (target) => nodeFs.unlink(target),
        rename: vi.fn(async () => undefined),
      },
      {
        jobId: job.id,
        ranges,
        takePath: "/p/take-1.mp4",
        outputPath,
        workDir,
        width: 640,
        height: 360,
        fps: 30,
      },
    );

    expect(received).toBe(signalBefore);
  });

  it("a cancel before beginPublish kills the child, publishes nothing, and leaves no partial", async () => {
    const { registry, job } = await makeJob();
    const { workDir, outputPath } = await setup();
    await nodeFs.writeFile(outputPath, "old cut bytes");
    let received: AbortSignal | undefined;
    const spawn: CaptureSpawner = async (_file, _args, options) => {
      received = options.signal;
      await new Promise<void>((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    };

    const running = runAssemblyJob(
      {
        registry,
        spawn,
        mkdir: async (target) => {
          await nodeFs.mkdir(target, { recursive: true });
        },
        writeFile: (target, data) => nodeFs.writeFile(target, data),
        unlink: (target) => nodeFs.unlink(target),
        rename: (from, to) => nodeFs.rename(from, to),
      },
      {
        jobId: job.id,
        ranges,
        takePath: "/p/take-1.mp4",
        outputPath,
        workDir,
        width: 640,
        height: 360,
        fps: 30,
      },
    );

    await vi.waitFor(() => expect(received).toBeDefined());
    await registry.cancel(job.id);
    await running;

    expect(received?.aborted).toBe(true);
    expect(await nodeFs.readFile(outputPath, "utf8")).toBe("old cut bytes");
    expect(await partialFiles(path.dirname(outputPath))).toEqual([]);
    expect(registry.get(job.id)?.status).toBe("cancelled");
  });

  it("rejects a cancel after beginPublish and ends the job done", async () => {
    const { registry, job } = await makeJob();
    const { workDir, outputPath } = await setup();
    let cancelError: unknown;
    const rename = vi.fn(async () => {
      cancelError = await registry.cancel(job.id).catch((error) => error);
    });

    await runAssemblyJob(
      {
        registry,
        spawn: vi.fn(async () => undefined),
        mkdir: async (target) => {
          await nodeFs.mkdir(target, { recursive: true });
        },
        writeFile: (target, data) => nodeFs.writeFile(target, data),
        unlink: (target) => nodeFs.unlink(target),
        rename,
      },
      {
        jobId: job.id,
        ranges,
        takePath: "/p/take-1.mp4",
        outputPath,
        workDir,
        width: 640,
        height: 360,
        fps: 30,
      },
    );

    expect(cancelError).toMatchObject({ code: "publishing" });
    expect(rename).toHaveBeenCalled();
    expect(registry.get(job.id)?.status).toBe("done");
  });
});
