import type { JobRegistry } from "@verbal/core";
import { describe, expect, it } from "vitest";
import { buildNormalizeArgs, runNormalizeJob } from "./normalize-job";

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
  const input = {
    jobId: "job-1",
    inputPath: "/in.webm",
    outputPath: "/out.mp4",
    durationSeconds: 2,
  };

  it("marks the job done with the output path", async () => {
    const calls: string[] = [];
    const spawn = async (
      _file: string,
      _args: readonly string[],
      options: { signal: AbortSignal; onStdout: (chunk: string) => void },
    ): Promise<void> => {
      options.onStdout("out_time_ms=500000\n");
    };

    await runNormalizeJob(
      { registry: fakeRegistry(calls), spawn, unlink: async () => undefined },
      input,
    );

    expect(calls[0]).toBe("start");
    expect(calls).toContain('complete:{"outputPath":"/out.mp4"}');
  });

  it("runs onOutput before marking the job done", async () => {
    const calls: string[] = [];
    const outputs: string[] = [];
    const spawn = async (): Promise<void> => undefined;

    await runNormalizeJob(
      { registry: fakeRegistry(calls), spawn, unlink: async () => undefined },
      {
        ...input,
        onOutput: async (path) => {
          outputs.push(path);
          calls.push("onOutput");
        },
      },
    );

    expect(outputs).toEqual(["/out.mp4"]);
    expect(calls.indexOf("onOutput")).toBeLessThan(
      calls.findIndex((call) => call.startsWith("complete:")),
    );
  });

  it("fails the job and removes the partial output", async () => {
    const calls: string[] = [];
    const unlinked: string[] = [];
    const spawn = async (): Promise<void> => {
      throw new Error("ffmpeg failed");
    };

    await runNormalizeJob(
      {
        registry: fakeRegistry(calls),
        spawn,
        unlink: async (path) => {
          unlinked.push(path);
        },
      },
      input,
    );

    expect(calls).toContain("fail:ffmpeg failed");
    expect(unlinked).toEqual(["/out.mp4"]);
  });
});
