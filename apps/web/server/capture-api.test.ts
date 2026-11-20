import { describe, expect, it, vi } from "vitest";
import {
  JobRegistry,
  createMemoryJobStore,
  createProject,
} from "@verbal/core";
import { startCapture } from "./capture-api";
import { createFakeFileSystem } from "./test-support";

const now = () => new Date("2026-11-20T00:00:00.000Z");

async function setup() {
  const fs = createFakeFileSystem();
  const root = "/projects/demo";
  await createProject(fs, root, { name: "Demo", id: "p1" });
  const registry = await JobRegistry.open(createMemoryJobStore(), now);

  const runCapture = vi.fn(
    async (jobId: string, request: { outputPath: string }) => {
      await registry.start(jobId);
      await registry.complete(jobId, { outputPath: request.outputPath });
    },
  );

  return { fs, root, registry, runCapture };
}

describe("startCapture", () => {
  it("starts a capture job", async () => {
    const { fs, root, registry, runCapture } = await setup();

    const response = await startCapture(
      { fs, registry, now, runCapture },
      { projectRoot: root, durationSeconds: 5 },
    );

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ kind: "capture" });
  });

  it("records the captured file as the project media", async () => {
    const { fs, root, registry, runCapture } = await setup();

    await startCapture(
      { fs, registry, now, runCapture },
      { projectRoot: root, durationSeconds: 5 },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    const project = JSON.parse(fs.files.get("/projects/demo/project.json") ?? "{}") as {
      media?: { assetPath?: string };
    };
    expect(project.media?.assetPath).toMatch(/^assets\/capture-.*\.mp4$/);
  });

  it("rejects a missing duration", async () => {
    const { fs, root, registry, runCapture } = await setup();

    const response = await startCapture(
      { fs, registry, now, runCapture },
      { projectRoot: root },
    );

    expect(response.status).toBe(400);
  });

  it("rejects an unknown project", async () => {
    const { fs, registry, runCapture } = await setup();

    const response = await startCapture(
      { fs, registry, now, runCapture },
      { projectRoot: "/projects/missing", durationSeconds: 5 },
    );

    expect(response.status).toBe(404);
  });
});
