import { describe, expect, it, vi } from "vitest";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import { runCaptureJob, type CaptureSpawner } from "./capture-job";

const now = () => new Date("2026-11-20T00:00:00.000Z");

async function makeJob() {
  const registry = await JobRegistry.open(createMemoryJobStore(), now);
  const job = await registry.create("capture");
  return { registry, job };
}

describe("runCaptureJob", () => {
  it("records and completes the job", async () => {
    const { registry, job } = await makeJob();
    const spawn: CaptureSpawner = vi.fn(async () => undefined);

    await runCaptureJob(
      { registry, spawn, unlink: vi.fn(async () => undefined) },
      { jobId: job.id, request: { outputPath: "/out/cap.mp4", durationSeconds: 5 } },
    );

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(registry.get(job.id)).toMatchObject({
      status: "done",
      result: { outputPath: "/out/cap.mp4" },
    });
  });

  it("fails the job and removes the partial file when recording fails", async () => {
    const { registry, job } = await makeJob();
    const unlink = vi.fn(async () => undefined);
    const spawn: CaptureSpawner = async () => {
      throw new Error("no device");
    };

    await runCaptureJob(
      { registry, spawn, unlink },
      { jobId: job.id, request: { outputPath: "/out/cap.mp4", durationSeconds: 5 } },
    );

    expect(registry.get(job.id)).toMatchObject({ status: "failed", error: "no device" });
    expect(unlink).toHaveBeenCalledWith("/out/cap.mp4");
  });

  it("reports progress from ffmpeg output", async () => {
    const { registry, job } = await makeJob();
    const spawn: CaptureSpawner = async (_file, _args, options) => {
      options.onStdout("out_time_ms=2500000\n");
    };

    await runCaptureJob(
      { registry, spawn, unlink: vi.fn(async () => undefined) },
      { jobId: job.id, request: { outputPath: "/out/cap.mp4", durationSeconds: 5 } },
    );

    expect(registry.get(job.id)?.status).toBe("done");
  });

  it("runs onOutput after the recording and before the job is done", async () => {
    const { registry, job } = await makeJob();
    const spawn = vi.fn(async () => undefined);
    const order: string[] = [];

    await runCaptureJob(
      { registry, spawn, unlink: vi.fn(async () => undefined) },
      {
        jobId: job.id,
        request: {
          outputPath: "/out/cap.mp4",
          durationSeconds: 5,
          onOutput: async () => {
            order.push("save");
            expect(registry.get(job.id)?.status).toBe("running");
          },
        },
      },
    );

    expect(order).toEqual(["save"]);
    expect(registry.get(job.id)).toMatchObject({ status: "done" });
  });

  it("fails the job when the project save throws", async () => {
    const { registry, job } = await makeJob();
    const spawn = vi.fn(async () => undefined);

    await runCaptureJob(
      { registry, spawn, unlink: vi.fn(async () => undefined) },
      {
        jobId: job.id,
        request: {
          outputPath: "/out/cap.mp4",
          durationSeconds: 5,
          onOutput: async () => {
            throw new Error("disk full");
          },
        },
      },
    );

    expect(registry.get(job.id)).toMatchObject({ status: "failed", error: "disk full" });
  });
});
