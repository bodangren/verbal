import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import handler from "../pages/api/transcribe/batch";
import { setJobRegistry } from "./registry";

function projectDocument(name: string) {
  return JSON.stringify({
    schemaVersion: 1,
    id: name,
    name,
    createdAt: "2026-11-21T00:00:00.000Z",
  });
}

describe("POST /api/transcribe/batch", () => {
  let root = "";
  let mediaFree = "";
  let withTranscript = "";
  let server: ReturnType<typeof createServer>;
  let base = "";
  let registry: JobRegistry;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "verbal-batch-"));
    mediaFree = path.join(root, "no-media");
    withTranscript = path.join(root, "transcribed");

    const { mkdir } = await import("node:fs/promises");
    for (const directory of [mediaFree, withTranscript]) {
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "project.json"), projectDocument(path.basename(directory)));
    }

    // The transcribed project also needs media, or "no-media" would win over
    // "transcribed" and hide the reason this test exists for.
    await writeFile(
      path.join(withTranscript, "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "transcribed",
        name: "transcribed",
        createdAt: "2026-11-21T00:00:00.000Z",
        media: { externalPath: "/media/take.mp4" },
      }),
    );
    await writeFile(
      path.join(withTranscript, "transcript.json"),
      JSON.stringify({
        schemaVersion: 1,
        words: [{ id: "w0", text: "hi", start: 0, end: 1 }],
        segments: [{ id: "s0", wordIds: ["w0"] }],
        removedWordIds: [],
      }),
    );

    server = createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
    setJobRegistry(undefined);
  });

  beforeEach(async () => {
    registry = await JobRegistry.open(createMemoryJobStore());
    setJobRegistry(registry);
  });

  afterEach(() => {
    setJobRegistry(undefined);
  });

  async function waitForJob(id: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const record = registry.get(id);
      if (record !== undefined && record.status !== "queued" && record.status !== "running") {
        return record;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("batch job did not finish");
  }

  it("plans skips with their reasons and completes the job", async () => {
    const response = await fetch(`${base}/api/transcribe/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roots: [mediaFree, withTranscript] }),
    });

    expect(response.status).toBe(202);
    const body = (await response.json()) as {
      plan: { items: { root: string; action: string; reason?: string }[] };
      job: { id: string };
    };

    expect(body.plan.items).toEqual([
      { root: mediaFree, action: "skip", reason: "no-media" },
      { root: withTranscript, action: "skip", reason: "transcribed" },
    ]);

    const finished = await waitForJob(body.job.id);
    expect(finished.status).toBe("done");
  });

  it("collapses a duplicated root", async () => {
    const response = await fetch(`${base}/api/transcribe/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roots: [withTranscript, withTranscript] }),
    });

    const body = (await response.json()) as { plan: { items: unknown[] } };
    expect(body.plan.items).toHaveLength(1);
  });

  it("rejects malformed input and another method", async () => {
    const notArray = await fetch(`${base}/api/transcribe/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roots: "nope" }),
    });
    expect(notArray.status).toBe(400);

    const relative = await fetch(`${base}/api/transcribe/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roots: ["relative/path"] }),
    });
    expect(relative.status).toBe(400);

    const get = await fetch(`${base}/api/transcribe/batch`);
    expect(get.status).toBe(405);
  });
});
