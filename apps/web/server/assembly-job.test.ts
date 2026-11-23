import { promises as nodeFs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JobRegistry } from "@verbal/core";
import { afterEach, describe, expect, it } from "vitest";
import { runAssemblyJob } from "./assembly-job";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

function fakeRegistry(calls: string[]): JobRegistry {
  return {
    start: async () => {
      calls.push("start");
    },
    progress: async (_id: string, progress: number, message: string) => {
      calls.push(`progress:${progress}:${message}`);
    },
    complete: async (_id: string, result: unknown) => {
      calls.push(`complete:${JSON.stringify(result)}`);
    },
    fail: async (_id: string, message: string) => {
      calls.push(`fail:${message}`);
    },
  } as unknown as JobRegistry;
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "verbal-assembly-"));
  roots.push(root);
  const workDir = path.join(root, "takes", ".assembly-job-1");
  const outputPath = path.join(root, "assets", "cut.mp4");
  await nodeFs.mkdir(path.join(root, "assets"), { recursive: true });
  const calls: string[] = [];
  return { root, workDir, outputPath, calls };
}

const ranges = [
  { takeId: "take-1", startSeconds: 0, endSeconds: 2 },
  { takeId: "take-1", startSeconds: 4, endSeconds: 6 },
];

describe("runAssemblyJob", () => {
  it("cuts each range, concatenates, and completes", async () => {
    const { workDir, outputPath, calls } = await setup();
    const outputs: string[] = [];
    const spawn = async (
      _file: string,
      args: readonly string[],
    ): Promise<void> => {
      calls.push(`spawn:${args.join(" ")}`);
    };

    await runAssemblyJob(
      {
        registry: fakeRegistry(calls),
        spawn,
        mkdir: async (target) => {
          await nodeFs.mkdir(target, { recursive: true });
        },
        writeFile: (target, data) => nodeFs.writeFile(target, data),
        unlink: (target) => nodeFs.unlink(target),
      },
      {
        jobId: "job-1",
        ranges,
        takePath: "/p/take-1.mp4",
        outputPath,
        workDir,
        width: 640,
        height: 360,
        fps: 30,
        onOutput: async (target) => {
          outputs.push(target);
        },
      },
    );

    const spawns = calls.filter((call) => call.startsWith("spawn:"));
    expect(spawns).toHaveLength(3);
    expect(spawns.some((call) => call.includes("-ss"))).toBe(true);
    expect(spawns.some((call) => call.includes("concat"))).toBe(true);
    expect(calls).toContain(
      `complete:{"outputPath":${JSON.stringify(outputPath)},"ranges":2}`,
    );
    expect(outputs).toEqual([outputPath]);
  });

  it("fails the job when a cut fails", async () => {
    const { workDir, outputPath, calls } = await setup();
    const spawn = async (): Promise<void> => {
      throw new Error("ffmpeg failed");
    };

    await runAssemblyJob(
      {
        registry: fakeRegistry(calls),
        spawn,
        mkdir: async (target) => {
          await nodeFs.mkdir(target, { recursive: true });
        },
        writeFile: (target, data) => nodeFs.writeFile(target, data),
        unlink: (target) => nodeFs.unlink(target),
      },
      {
        jobId: "job-1",
        ranges,
        takePath: "/p/take-1.mp4",
        outputPath,
        workDir,
        width: 640,
        height: 360,
        fps: 30,
      },
    );

    expect(calls).toContain("fail:ffmpeg failed");
    expect(calls).not.toContain(
      `complete:{"outputPath":${JSON.stringify(outputPath)},"ranges":2}`,
    );
  });
});
