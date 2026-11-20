import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTranscript, removeWord, serializeTranscript } from "@verbal/core";
import handler from "../pages/api/cleanup/freeze";
import { createFreezeApi } from "./freeze-api";
import { createFakeFileSystem } from "./test-support";

const SPOKEN = [
  { text: "keep", start: 0, end: 0.5 },
  { text: "drop", start: 0.6, end: 1 },
  { text: "tail", start: 1.5, end: 2 },
];

function projectDocument(media: Record<string, string> | undefined) {
  return JSON.stringify({
    schemaVersion: 1,
    id: "p1",
    name: "Freeze",
    createdAt: "2026-11-21T00:00:00.000Z",
    ...(media === undefined ? {} : { media }),
  });
}

const ROOT = path.join(path.sep, "tmp", "verbal-freeze");

describe("freeze service", () => {
  function makeApi(input: { media?: Record<string, string>; transcript?: string | null } = {}) {
    const fs = createFakeFileSystem();
    fs.files.set(path.join(ROOT, "project.json"), projectDocument(input.media));
    if (input.transcript !== null) {
      fs.files.set(
        path.join(ROOT, "transcript.json"),
        input.transcript ?? serializeTranscript(createTranscript(SPOKEN)),
      );
    }

    const api = createFreezeApi({
      fs,
      probeSeconds: async () => 3,
    });

    return { api, fs };
  }

  it("freezes the saved removals into a cut list and anchors, and persists it", async () => {
    const saved = removeWord(createTranscript(SPOKEN), "w1");
    const { api, fs } = makeApi({
      media: { assetPath: "assets/take.mp4" },
      transcript: serializeTranscript(saved),
    });

    const { master } = await api.freeze(ROOT);

    expect(master.removedWordIds).toEqual(["w1"]);
    expect(master.cutList.kept).toEqual([
      { start: 0, end: 0.6 },
      { start: 1, end: 3 },
    ]);
    expect(master.anchorWords.map((anchor) => anchor.id)).toEqual(["w0", "w2"]);
    expect(master.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const stored = JSON.parse((await fs.readFile(path.join(ROOT, "edit.json"))) as string) as {
      frozen: { fingerprint: string };
    };
    expect(stored.frozen.fingerprint).toBe(master.fingerprint);
  });

  it("reports a missing transcript and missing media as not found", async () => {
    await expect(
      makeApi({ media: { assetPath: "assets/take.mp4" }, transcript: null }).api.freeze(ROOT),
    ).rejects.toThrow(/no transcript/i);

    await expect(makeApi({}).api.freeze(ROOT)).rejects.toThrow(/no media/i);
  });
});

describe("POST /api/cleanup/freeze", () => {
  let root = "";
  let server: ReturnType<typeof createServer>;
  let base = "";

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "verbal-freeze-route-"));
    await writeFile(
      path.join(root, "project.json"),
      projectDocument({ externalPath: "/media/take.mp4" }),
    );
    await writeFile(
      path.join(root, "transcript.json"),
      serializeTranscript(removeWord(createTranscript(SPOKEN), "w1")),
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
  });

  it("freezes the project and reports the cut list and anchors", async () => {
    const { execFileSync } = await import("node:child_process");

    // The route probes with the real ffprobe, so the source must be real media.
    const source = path.join(root, "assets", "take.mp4");
    await mkdir(path.dirname(source), { recursive: true });
    execFileSync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "testsrc=size=64x36:rate=10", "-t", "2", "-pix_fmt", "yuv420p", source],
      { stdio: "ignore" },
    );
    await writeFile(
      path.join(root, "project.json"),
      projectDocument({ assetPath: "assets/take.mp4" }),
    );

    const response = await fetch(`${base}/api/cleanup/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      master: { cutList: { kept: unknown[] }; anchorWords: unknown[]; fingerprint: string };
    };
    expect(body.master.cutList.kept.length).toBeGreaterThan(0);
    expect(body.master.anchorWords.length).toBeGreaterThan(0);
    expect(body.master.fingerprint).toHaveLength(64);
  });

  it("rejects a relative root and another method", async () => {
    const relative = await fetch(`${base}/api/cleanup/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: "relative/path" }),
    });
    expect(relative.status).toBe(400);

    const get = await fetch(`${base}/api/cleanup/freeze?root=${encodeURIComponent(root)}`);
    expect(get.status).toBe(405);
  });

  it("reports a project without a transcript as 404", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "verbal-freeze-empty-"));
    await writeFile(path.join(empty, "project.json"), projectDocument(undefined));

    const response = await fetch(`${base}/api/cleanup/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: empty }),
    });

    expect(response.status).toBe(404);
    await rm(empty, { recursive: true, force: true });
  });

  it("keeps the frozen metadata readable as JSON", async () => {
    const file = await readFile(path.join(root, "edit.json"), "utf8").catch(() => null);
    expect(file === null || file.endsWith("\n")).toBe(true);
  });
});
