import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import handler from "../pages/api/media/file";
import { createFakeFileSystem } from "./test-support";
import {
  createMediaFileApi,
  mimeTypeFor,
  planMediaResponse,
  type MediaFileDeps,
} from "./media-file";

describe("mimeTypeFor", () => {
  it("maps the container extensions the app imports", () => {
    expect(mimeTypeFor("/media/take.mp4")).toBe("video/mp4");
    expect(mimeTypeFor("/media/take.webm")).toBe("video/webm");
    expect(mimeTypeFor("/media/take.mov")).toBe("video/quicktime");
    expect(mimeTypeFor("/media/take.mkv")).toBe("video/x-matroska");
    expect(mimeTypeFor("/media/take.m4a")).toBe("audio/mp4");
    expect(mimeTypeFor("/media/take.mp3")).toBe("audio/mpeg");
    expect(mimeTypeFor("/media/take.wav")).toBe("audio/wav");
  });

  it("is case-insensitive and falls back to a byte stream", () => {
    expect(mimeTypeFor("/media/TAKE.MP4")).toBe("video/mp4");
    expect(mimeTypeFor("/media/take.unknownext")).toBe("application/octet-stream");
  });
});

describe("planMediaResponse", () => {
  it("serves the whole file when no range is requested", () => {
    const plan = planMediaResponse({
      method: "GET",
      rangeHeader: null,
      size: 1000,
      mimeType: "video/mp4",
    });

    expect(plan.status).toBe(200);
    expect(plan.range).toBeNull();
    expect(plan.headers).toMatchObject({
      "Content-Type": "video/mp4",
      "Content-Length": "1000",
      "Accept-Ranges": "bytes",
    });
  });

  it("serves a closed range with 206 and the range length", () => {
    const plan = planMediaResponse({
      method: "GET",
      rangeHeader: "bytes=100-199",
      size: 1000,
      mimeType: "video/mp4",
    });

    expect(plan.status).toBe(206);
    expect(plan.range).toEqual({ start: 100, end: 199 });
    expect(plan.headers).toMatchObject({
      "Content-Range": "bytes 100-199/1000",
      "Content-Length": "100",
      "Accept-Ranges": "bytes",
    });
  });

  it("answers a range past the end with 416 and the current size", () => {
    const plan = planMediaResponse({
      method: "GET",
      rangeHeader: "bytes=5000-",
      size: 1000,
      mimeType: "video/mp4",
    });

    expect(plan.status).toBe(416);
    expect(plan.headers).toMatchObject({ "Content-Range": "bytes */1000" });
  });

  it("ignores a malformed range and serves the whole file", () => {
    const plan = planMediaResponse({
      method: "GET",
      rangeHeader: "bytes=nonsense",
      size: 1000,
      mimeType: "video/mp4",
    });

    expect(plan.status).toBe(200);
    expect(plan.range).toBeNull();
  });

  it("plans headers for HEAD without a body", () => {
    const plan = planMediaResponse({
      method: "HEAD",
      rangeHeader: null,
      size: 1000,
      mimeType: "video/mp4",
    });

    expect(plan.status).toBe(200);
    expect(plan.headers["Content-Length"]).toBe("1000");
    expect(plan.body).toBe(false);
  });

  it("gets a body for GET", () => {
    const plan = planMediaResponse({
      method: "GET",
      rangeHeader: null,
      size: 1000,
      mimeType: "video/mp4",
    });

    expect(plan.body).toBe(true);
  });
});

/** A project document as stored on disk, with optional media. */
function projectDocument(media?: { assetPath?: string; externalPath?: string }) {
  return JSON.stringify({
    schemaVersion: 1,
    id: "p1",
    name: "Demo",
    createdAt: "2026-11-21T00:00:00.000Z",
    ...(media === undefined ? {} : { media }),
  });
}

describe("media file resolution", () => {
  const root = path.join(path.sep, "tmp", "project");

  function makeApi(overrides: Partial<MediaFileDeps> = {}) {
    return createMediaFileApi({
      statSize: async () => 4242,
      ...overrides,
    });
  }

  function fakeProject(contents: string | null) {
    const fs = createFakeFileSystem();
    if (contents !== null) {
      fs.files.set(path.join(root, "project.json"), contents);
    }
    return fs;
  }

  it("resolves the copied asset inside the project", async () => {
    const fs = fakeProject(projectDocument({ assetPath: "assets/take.mp4" }));

    const file = await makeApi({ fs }).resolve(root);

    expect(file.path).toBe(path.join(root, "assets", "take.mp4"));
    expect(file.size).toBe(4242);
  });

  it("reports a project without media as not found", async () => {
    await expect(makeApi({ fs: fakeProject(projectDocument()) }).resolve(root)).rejects.toThrow(
      /no media/i,
    );
  });

  it("reports a missing project as not found", async () => {
    await expect(makeApi({ fs: fakeProject(null) }).resolve(root)).rejects.toThrow(/no project/i);
  });

  it("reports a missing file as not found", async () => {
    const fs = fakeProject(projectDocument({ assetPath: "assets/take.mp4" }));
    const missing = Object.assign(new Error("ENOENT"), { code: "ENOENT" });

    await expect(
      makeApi({ fs, statSize: async () => Promise.reject(missing) }).resolve(root),
    ).rejects.toThrow(/no media file/i);
  });
});

describe("media file route", () => {
  let root = "";
  let server: ReturnType<typeof createServer>;
  let base = "";
  const BYTES = Buffer.from(Array.from({ length: 1000 }, (_unused, index) => index % 251));

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "verbal-media-"));
    await mkdir(path.join(root, "assets"), { recursive: true });
    await writeFile(path.join(root, "project.json"), projectDocument({ assetPath: "assets/take.mp4" }));
    await writeFile(path.join(root, "assets", "take.mp4"), BYTES);

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

  it("serves the whole file with the right headers", async () => {
    const response = await fetch(`${base}/api/media/file?root=${encodeURIComponent(root)}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe("1000");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(Buffer.from(await response.arrayBuffer()).equals(BYTES)).toBe(true);
  });

  it("serves exactly the requested bytes for a range", async () => {
    const response = await fetch(`${base}/api/media/file?root=${encodeURIComponent(root)}`, {
      headers: { Range: "bytes=100-199" },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 100-199/1000");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.length).toBe(100);
    expect(body.equals(BYTES.subarray(100, 200))).toBe(true);
  });

  it("serves the tail for a suffix range", async () => {
    const response = await fetch(`${base}/api/media/file?root=${encodeURIComponent(root)}`, {
      headers: { Range: "bytes=-10" },
    });

    expect(response.status).toBe(206);
    expect(Buffer.from(await response.arrayBuffer()).equals(BYTES.subarray(990))).toBe(true);
  });

  it("answers a past-the-end range with 416", async () => {
    const response = await fetch(`${base}/api/media/file?root=${encodeURIComponent(root)}`, {
      headers: { Range: "bytes=5000-" },
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */1000");
  });

  it("answers HEAD with headers and no body", async () => {
    const response = await fetch(`${base}/api/media/file?root=${encodeURIComponent(root)}`, {
      method: "HEAD",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("1000");
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it("rejects a relative root and a non-read method", async () => {
    const relative = await fetch(`${base}/api/media/file?root=relative%2Fpath`);
    expect(relative.status).toBe(400);

    const post = await fetch(`${base}/api/media/file?root=${encodeURIComponent(root)}`, {
      method: "POST",
    });
    expect(post.status).toBe(405);
  });

  it("reports a project with no media as 404", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "verbal-empty-"));
    const response = await fetch(`${base}/api/media/file?root=${encodeURIComponent(empty)}`);
    expect(response.status).toBe(404);
    await rm(empty, { recursive: true, force: true });
  });
});
