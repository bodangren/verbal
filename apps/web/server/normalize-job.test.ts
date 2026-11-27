import { promises as nodeFs } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptureSpawner } from "./capture-job";
import { buildNormalizeArgs, runNormalizeJob } from "./normalize-job";

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
  const root = await mkdtemp(path.join(os.tmpdir(), "verbal-normalize-"));
  roots.push(root);
  return root;
}

function partialFiles(root: string): Promise<string[]> {
  return readdir(root).then((names) => names.filter((name) => name.includes(".partial")));
}

describe("buildNormalizeArgs", () => {
  it("builds an MP4/H.264/AAC argv", () => {
    const args = buildNormalizeArgs("/in.webm", "/out.mp4");

    expect(args).toEqual(
      expect.arrayContaining(["-i", "/in.webm", "/out.mp4", "libx264", "aac"]),
    );
    expect(args).toContain("-ar");
    expect(args).toContain("48000");
    expect(args[args.length - 1]).toBe("/out.mp4");
  });

  it("refuses empty paths", () => {
    expect(() => buildNormalizeArgs("", "/out.mp4")).toThrow(/required/);
    expect(() => buildNormalizeArgs("/in.webm", "")).toThrow(/required/);
  });
});

describe("runNormalizeJob", () => {
  it("writes ffmpeg output to the partial and marks the job done", async () => {
    const { registry, job } = await makeJob();
    let writtenTo = "";
    const spawn: CaptureSpawner = async (_file, args, options) => {
      writtenTo = args[args.length - 1]!;
      options.onStdout("out_time_ms=500000\n");
    };

    await runNormalizeJob(
      {
        registry,
        spawn,
        unlink: vi.fn(async () => undefined),
        rename: vi.fn(async () => undefined),
      },
      { jobId: job.id, inputPath: "/in.webm", outputPath: "/out.mp4", durationSeconds: 2 },
    );

    expect(writtenTo).toBe(`/out.${job.id}.partial.mp4`);
    expect(registry.get(job.id)).toMatchObject({
      status: "done",
      result: { outputPath: "/out.mp4" },
    });
  });

  it("runs onOutput after the rename and before the job is done", async () => {
    const { registry, job } = await makeJob();
    const events: string[] = [];
    const rename = vi.fn(async () => {
      events.push("rename");
    });
    const spawn: CaptureSpawner = async () => undefined;

    await runNormalizeJob(
      { registry, spawn, unlink: vi.fn(async () => undefined), rename },
      {
        jobId: job.id,
        inputPath: "/in.webm",
        outputPath: "/out.mp4",
        durationSeconds: 2,
        onOutput: async (outputPath) => {
          events.push(`onOutput:${outputPath}`);
        },
      },
    );

    expect(events).toEqual(["rename", "onOutput:/out.mp4"]);
    expect(registry.get(job.id)?.status).toBe("done");
  });

  it("leaves an existing take byte-identical and removes only the partial on failure", async () => {
    const { registry, job } = await makeJob();
    const root = await makeDir();
    const outputPath = path.join(root, "take-1.mp4");
    await nodeFs.writeFile(outputPath, "old take bytes");
    const spawn: CaptureSpawner = async () => {
      throw new Error("ffmpeg failed");
    };

    await runNormalizeJob(
      {
        registry,
        spawn,
        unlink: (target) => nodeFs.unlink(target),
        rename: (from, to) => nodeFs.rename(from, to),
      },
      { jobId: job.id, inputPath: path.join(root, "in.webm"), outputPath, durationSeconds: 2 },
    );

    expect(await nodeFs.readFile(outputPath, "utf8")).toBe("old take bytes");
    expect(await partialFiles(root)).toEqual([]);
    expect(registry.get(job.id)).toMatchObject({ status: "failed", error: "ffmpeg failed" });
  });

  it("renames the partial over the destination on success", async () => {
    const { registry, job } = await makeJob();
    const root = await makeDir();
    const outputPath = path.join(root, "take-1.mp4");
    const spawn: CaptureSpawner = async (_file, args) => {
      await nodeFs.writeFile(args[args.length - 1]!, "new take bytes");
    };

    await runNormalizeJob(
      {
        registry,
        spawn,
        unlink: (target) => nodeFs.unlink(target),
        rename: (from, to) => nodeFs.rename(from, to),
      },
      { jobId: job.id, inputPath: path.join(root, "in.webm"), outputPath, durationSeconds: 2 },
    );

    expect(await nodeFs.readFile(outputPath, "utf8")).toBe("new take bytes");
    expect(await partialFiles(root)).toEqual([]);
  });

  it("passes the registry signal, not a private controller, to the runner", async () => {
    const { registry, job } = await makeJob();
    const signalBefore = registry.signalOf(job.id);
    let received: AbortSignal | undefined;
    const spawn: CaptureSpawner = async (_file, _args, options) => {
      received = options.signal;
    };

    await runNormalizeJob(
      { registry, spawn, unlink: vi.fn(async () => undefined) },
      { jobId: job.id, inputPath: "/in.webm", outputPath: "/out.mp4", durationSeconds: 2 },
    );

    expect(received).toBe(signalBefore);
  });

  it("a cancel before beginPublish kills the child, publishes nothing, and leaves no partial", async () => {
    const { registry, job } = await makeJob();
    const root = await makeDir();
    const outputPath = path.join(root, "take-1.mp4");
    await nodeFs.writeFile(outputPath, "old take bytes");
    let received: AbortSignal | undefined;
    const spawn: CaptureSpawner = async (_file, _args, options) => {
      received = options.signal;
      await new Promise<void>((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    };

    const running = runNormalizeJob(
      {
        registry,
        spawn,
        unlink: (target) => nodeFs.unlink(target),
        rename: (from, to) => nodeFs.rename(from, to),
      },
      { jobId: job.id, inputPath: path.join(root, "in.webm"), outputPath, durationSeconds: 2 },
    );

    await vi.waitFor(() => expect(received).toBeDefined());
    await registry.cancel(job.id);
    await running;

    expect(received?.aborted).toBe(true);
    expect(await nodeFs.readFile(outputPath, "utf8")).toBe("old take bytes");
    expect(await partialFiles(root)).toEqual([]);
    expect(registry.get(job.id)?.status).toBe("cancelled");
  });

  it("rejects a cancel after beginPublish and ends the job done", async () => {
    const { registry, job } = await makeJob();
    let cancelError: unknown;
    const rename = vi.fn(async () => {
      cancelError = await registry.cancel(job.id).catch((error) => error);
    });

    await runNormalizeJob(
      {
        registry,
        spawn: vi.fn(async () => undefined),
        unlink: vi.fn(async () => undefined),
        rename,
      },
      { jobId: job.id, inputPath: "/in.webm", outputPath: "/out.mp4", durationSeconds: 2 },
    );

    expect(cancelError).toMatchObject({ code: "publishing" });
    expect(rename).toHaveBeenCalled();
    expect(registry.get(job.id)?.status).toBe("done");
  });
});
