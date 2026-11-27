import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import {
  JobRegistry,
  computeMediaRevision,
  createMemoryJobStore,
  createProject,
} from "@verbal/core";
import { startCapture } from "./capture-api";
import { runCaptureJob, type CaptureJobInput, type CaptureSpawner } from "./capture-job";
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
    const runCapture = vi.fn(async (jobId: string, input: CaptureJobInput) => {
      await registry.start(jobId);
      await registry.complete(jobId, { outputPath: input.request.outputPath });
    });

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
        runCapture: (_jobId, input) =>
          runCaptureJob(
            {
              registry,
              spawn,
              unlink: vi.fn(async () => undefined),
              rename: vi.fn(async () => undefined),
            },
            input,
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
        runCapture: (_jobId, input) =>
          runCaptureJob(
            {
              registry,
              spawn,
              unlink: vi.fn(async () => undefined),
              rename: vi.fn(async () => undefined),
            },
            input,
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

  it("a cancel during the project save is rejected and the job ends done with the file kept", async () => {
    const { fs, root, registry } = await setup();
    const spawn: CaptureSpawner = vi.fn(async () => undefined);
    const unlink = vi.fn(async () => undefined);

    let releaseSave!: () => void;
    let saveStarted = false;
    const gate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const slowStat = vi.fn(async () => {
      saveStarted = true;
      await gate;
      return { size: 123, mtimeMs: 456 };
    });

    const response = await startCapture(
      {
        fs,
        registry,
        now,
        stat: slowStat,
        runCapture: (_jobId, input) =>
          runCaptureJob(
            {
              registry,
              spawn,
              unlink,
              rename: vi.fn(async () => undefined),
            },
            input,
          ),
      },
      { projectRoot: root, durationSeconds: 5 },
    );

    const jobId = (response.body as { id: string }).id;
    await vi.waitFor(() => expect(saveStarted).toBe(true));

    // The save runs inside the publication boundary, so a cancel is rejected.
    await expect(registry.cancel(jobId)).rejects.toMatchObject({ code: "publishing" });
    expect(registry.get(jobId)?.status).toBe("running");

    releaseSave();
    await vi.waitFor(() => expect(registry.get(jobId)?.status).toBe("done"));

    expect(unlink).not.toHaveBeenCalled();
    const project = JSON.parse(fs.files.get("/projects/demo/project.json") ?? "{}") as {
      media?: { assetPath?: string };
    };
    expect(project.media?.assetPath).toMatch(/^assets\/capture-.*\.mp4$/);
  });

  it("fails the job when the project save fails and removes the published file", async () => {
    const { fs, root, registry } = await setup();
    const spawn: CaptureSpawner = vi.fn(async () => undefined);
    const unlink = vi.fn(async () => undefined);
    const failingStat = vi.fn(async () => {
      throw new Error("disk full");
    });

    const response = await startCapture(
      {
        fs,
        registry,
        now,
        stat: failingStat,
        runCapture: (_jobId, input) =>
          runCaptureJob(
            {
              registry,
              spawn,
              unlink,
              rename: vi.fn(async () => undefined),
            },
            input,
          ),
      },
      { projectRoot: root, durationSeconds: 5 },
    );

    const jobId = (response.body as { id: string }).id;
    await vi.waitFor(() => expect(registry.get(jobId)?.status).toBe("failed"));
    expect(registry.get(jobId)?.error).toContain("disk full");
    expect(registry.get(jobId)?.error).toContain("removed");
    expect(unlink).toHaveBeenCalledWith(expect.stringMatching(/assets\/capture-.*\.mp4$/));
    expect(fs.files.has("/projects/demo/project.json")).toBe(true);
  });

  it("passes a plain-JSON capture request with no onOutput callback", async () => {
    const { fs, root, registry } = await setup();
    const requests: unknown[] = [];
    const runCapture = vi.fn(async (jobId: string, input: CaptureJobInput) => {
      requests.push(input.request);
      await registry.start(jobId);
      await registry.complete(jobId, { outputPath: input.request.outputPath });
    });

    await startCapture(
      { fs, registry, now, stat, runCapture },
      { projectRoot: root, durationSeconds: 5 },
    );

    expect(requests).toHaveLength(1);
    const request = requests[0] as Record<string, unknown>;
    expect("onOutput" in request).toBe(false);
    expect(typeof request.outputPath).toBe("string");
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);
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
