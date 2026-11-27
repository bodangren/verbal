import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import {
  JobRegistry,
  computeMediaRevision,
  createMemoryJobStore,
  createProject,
} from "@verbal/core";
import { startCapture } from "./capture-api";
import { runCaptureJob, type CaptureSpawner } from "./capture-job";
import { createFakeFileSystem } from "./test-support";

const now = () => new Date("2026-11-20T00:00:00.000Z");
const stat = async () => ({ size: 123, mtimeMs: 456 });

async function setup() {
  const fs = createFakeFileSystem();
  const root = "/projects/demo";
  await createProject(fs, root, { name: "Demo", id: "p1" });
  const registry = await JobRegistry.open(createMemoryJobStore(), now);
  return { fs, root, registry };
}

describe("startCapture", () => {
  it("starts a capture job", async () => {
    const { fs, root, registry } = await setup();
    const runCapture = vi.fn(
      async (jobId: string, request: { outputPath: string }) => {
        await registry.start(jobId);
        await registry.complete(jobId, { outputPath: request.outputPath });
      },
    );

    const response = await startCapture(
      { fs, registry, now, runCapture, stat },
      { projectRoot: root, durationSeconds: 5 },
    );

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ kind: "capture" });
  });

  it("records the captured file as the project media with a fresh revision", async () => {
    const { fs, root, registry } = await setup();
    const spawn: CaptureSpawner = vi.fn(async () => undefined);

    const response = await startCapture(
      {
        fs,
        registry,
        now,
        stat,
        runCapture: (jobId, request) =>
          runCaptureJob(
            { registry, spawn, unlink: vi.fn(async () => undefined) },
            { jobId, request },
          ),
      },
      { projectRoot: root, durationSeconds: 5 },
    );

    const jobId = (response.body as { id: string }).id;
    await vi.waitFor(() => expect(registry.get(jobId)?.status).toBe("done"));

    const project = JSON.parse(fs.files.get("/projects/demo/project.json") ?? "{}") as {
      media?: { assetPath?: string; mediaRevision?: string };
    };
    expect(project.media?.assetPath).toMatch(/^assets\/capture-.*\.mp4$/);
    const mediaPath = path.join("/projects/demo", project.media?.assetPath ?? "");
    expect(project.media?.mediaRevision).toBe(
      await computeMediaRevision({ mediaPath, stat }),
    );
  });

  it("marks the job done only after the project save completed", async () => {
    const { fs, root, registry } = await setup();
    const spawn: CaptureSpawner = vi.fn(async () => undefined);

    let releaseStat!: () => void;
    let statStarted = false;
    const gate = new Promise<void>((resolve) => {
      releaseStat = resolve;
    });
    const slowStat = vi.fn(async () => {
      statStarted = true;
      await gate;
      return { size: 123, mtimeMs: 456 };
    });

    const response = await startCapture(
      {
        fs,
        registry,
        now,
        stat: slowStat,
        runCapture: (jobId, request) =>
          runCaptureJob(
            { registry, spawn, unlink: vi.fn(async () => undefined) },
            { jobId, request },
          ),
      },
      { projectRoot: root, durationSeconds: 5 },
    );

    const jobId = (response.body as { id: string }).id;
    await vi.waitFor(() => expect(statStarted).toBe(true));
    expect(registry.get(jobId)?.status).toBe("running");

    releaseStat();
    await vi.waitFor(() => expect(registry.get(jobId)?.status).toBe("done"));

    const project = JSON.parse(fs.files.get("/projects/demo/project.json") ?? "{}") as {
      media?: { assetPath?: string };
    };
    expect(project.media?.assetPath).toMatch(/^assets\/capture-.*\.mp4$/);
  });

  it("fails the job when the project save fails", async () => {
    const { fs, root, registry } = await setup();
    const spawn: CaptureSpawner = vi.fn(async () => undefined);
    const failingStat = vi.fn(async () => {
      throw new Error("disk full");
    });

    const response = await startCapture(
      {
        fs,
        registry,
        now,
        stat: failingStat,
        runCapture: (jobId, request) =>
          runCaptureJob(
            { registry, spawn, unlink: vi.fn(async () => undefined) },
            { jobId, request },
          ),
      },
      { projectRoot: root, durationSeconds: 5 },
    );

    const jobId = (response.body as { id: string }).id;
    await vi.waitFor(() => expect(registry.get(jobId)?.status).toBe("failed"));
    expect(registry.get(jobId)?.error).toContain("disk full");
    expect(fs.files.has("/projects/demo/project.json")).toBe(true);
  });

  it("rejects a missing duration", async () => {
    const { fs, root, registry } = await setup();
    const runCapture = vi.fn(async () => undefined);

    const response = await startCapture(
      { fs, registry, now, runCapture, stat },
      { projectRoot: root },
    );

    expect(response.status).toBe(400);
  });

  it("rejects an unknown project", async () => {
    const { fs, registry } = await setup();
    const runCapture = vi.fn(async () => undefined);

    const response = await startCapture(
      { fs, registry, now, runCapture, stat },
      { projectRoot: "/projects/missing", durationSeconds: 5 },
    );

    expect(response.status).toBe(404);
  });
});
