import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializeTranscript, createTranscript } from "@verbal/core";
import handler from "../pages/api/cleanup";
import { createCleanupApi } from "./cleanup-api";
import { createFakeFileSystem } from "./test-support";

const transcript = createTranscript([
  { text: "so", start: 0, end: 0.4 },
  { text: "um", start: 0.5, end: 0.8 },
  { text: "today", start: 0.9, end: 1.4 },
]);

describe("cleanup API", () => {
  it("returns the detected proposals and no audio fixes", async () => {
    const fs = createFakeFileSystem();
    const root = path.join(path.sep, "tmp", "project");
    fs.files.set(path.join(root, "transcript.json"), serializeTranscript(transcript));

    const result = await createCleanupApi({ fs }).proposals(root);

    expect(result.audioFixes).toEqual([]);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ category: "filler", fromIndex: 1 });
  });

  it("reports a project without a transcript as not found", async () => {
    const fs = createFakeFileSystem();
    const root = path.join(path.sep, "tmp", "project");

    await expect(createCleanupApi({ fs }).proposals(root)).rejects.toThrow(/no transcript/i);
  });
});

describe("cleanup route", () => {
  let root = "";
  let server: ReturnType<typeof createServer>;
  let base = "";

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "verbal-cleanup-"));
    await mkdir(path.join(root, "assets"), { recursive: true });
    await writeFile(path.join(root, "transcript.json"), serializeTranscript(transcript));

    server = createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  it("serves the proposals for a project", async () => {
    const response = await fetch(`${base}/api/cleanup?root=${encodeURIComponent(root)}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      proposals: { category: string }[];
      audioFixes: unknown[];
    };
    expect(body.proposals).toHaveLength(1);
    expect(body.audioFixes).toEqual([]);
  });

  it("rejects a relative root", async () => {
    const response = await fetch(`${base}/api/cleanup?root=relative%2Fpath`);

    expect(response.status).toBe(400);
  });

  it("rejects another method", async () => {
    const response = await fetch(`${base}/api/cleanup?root=${encodeURIComponent(root)}`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("reports a project without a transcript as 404", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "verbal-cleanup-empty-"));
    const response = await fetch(`${base}/api/cleanup?root=${encodeURIComponent(empty)}`);

    expect(response.status).toBe(404);
    await rm(empty, { recursive: true, force: true });
  });
});
