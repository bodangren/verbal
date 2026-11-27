import { describe, expect, it } from "vitest";
import type { MediaInfo } from "@verbal/media";
import { computeMediaRevision } from "@verbal/core";
import { createProjectApi } from "./project-api";
import { createMediaApi } from "./media-api";
import { createFakeFileSystem } from "./test-support";

const INFO: MediaInfo = {
  durationSeconds: 3,
  formatName: "mp4",
  sizeBytes: 100,
  streams: [],
};

function makeApi(fs = createFakeFileSystem()) {
  return createMediaApi({
    fs,
    probe: async () => INFO,
    importMedia: async () => ({
      mode: "copy",
      assetPath: "assets/a.mp4",
      absolutePath: "/projects/demo/assets/a.mp4",
    }),
    stat: async () => ({ size: 100, mtimeMs: 456 }),
  });
}

describe("media API", () => {
  it("probes a media file", async () => {
    const api = makeApi();

    const response = await api.probe({ path: "/media/a.mp4" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ durationSeconds: 3 });
  });

  it("rejects a relative probe path", async () => {
    const api = makeApi();

    expect((await api.probe({ path: "media/a.mp4" })).status).toBe(400);
  });

  it("rejects a missing path", async () => {
    const api = makeApi();

    expect((await api.probe({})).status).toBe(400);
  });

  it("imports media and records it on the project", async () => {
    const fs = createFakeFileSystem();
    const projects = createProjectApi(fs);
    await projects.create({ root: "/projects/demo", name: "Demo" });
    const api = makeApi(fs);

    const response = await api.import({
      projectRoot: "/projects/demo",
      sourcePath: "/media/a.mp4",
      mode: "copy",
    });

    expect(response.status).toBe(200);

    const opened = await projects.open({ root: "/projects/demo" });
    const expectedRevision = await computeMediaRevision({
      mediaPath: "/projects/demo/assets/a.mp4",
      stat: async () => ({ size: 100, mtimeMs: 456 }),
    });
    expect((opened.body as { media?: unknown }).media).toEqual({
      assetPath: "assets/a.mp4",
      mediaRevision: expectedRevision,
    });
  });

  it("returns 404 when the project does not exist", async () => {
    const api = makeApi();

    const response = await api.import({
      projectRoot: "/projects/missing",
      sourcePath: "/media/a.mp4",
      mode: "copy",
    });

    expect(response.status).toBe(404);
  });
});
