import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api-client";

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

const fetchMock = vi.fn();

function lastCall() {
  const call = fetchMock.mock.calls.at(-1);
  return {
    url: String(call?.[0] ?? ""),
    method: (call?.[1] as RequestInit | undefined)?.method ?? "GET",
    body: (call?.[1] as RequestInit | undefined)?.body,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(reply({}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET endpoints", () => {
  it("reads the project, transcript, cleanup, storyboard, script and takes", async () => {
    await api.getProject("/p/x");
    expect(lastCall()).toMatchObject({ url: "/api/projects?root=%2Fp%2Fx", method: "GET" });

    await api.getTranscript("/p/x");
    expect(lastCall().url).toBe("/api/transcript?root=%2Fp%2Fx");

    await api.getCleanup("/p/x");
    expect(lastCall().url).toBe("/api/cleanup?root=%2Fp%2Fx");

    await api.getStoryboard("/p/x");
    expect(lastCall().url).toBe("/api/storyboard?root=%2Fp%2Fx");

    await api.getScript("/p/x");
    expect(lastCall().url).toBe("/api/script?root=%2Fp%2Fx");

    await api.listTakes("/p/x");
    expect(lastCall().url).toBe("/api/takes?root=%2Fp%2Fx");
  });

  it("reads the job, system and take transcript/review", async () => {
    await api.getJob("job-1");
    expect(lastCall()).toMatchObject({ url: "/api/jobs/job-1", method: "GET" });

    await api.getSystem();
    expect(lastCall().url).toBe("/api/system");

    await api.getTakeTranscript("/p/x", "take-1");
    expect(lastCall().url).toBe("/api/take-transcript?root=%2Fp%2Fx&takeId=take-1");

    await api.previewTakeReview("/p/x", "take-1");
    expect(lastCall().url).toBe("/api/take-review?root=%2Fp%2Fx&takeId=take-1");
  });

  it("lists folders with and without media files", async () => {
    await api.listFolder();
    expect(lastCall().url).toBe("/api/fs/list");

    await api.listFolder("/p");
    expect(lastCall().url).toBe("/api/fs/list?path=%2Fp");

    await api.listFolder("/p", { includeFiles: true });
    expect(lastCall().url).toBe("/api/fs/list?includeFiles=1&path=%2Fp");

    await api.listFolder(undefined, { includeFiles: true });
    expect(lastCall().url).toBe("/api/fs/list?includeFiles=1");
  });
});

describe("POST and PUT endpoints", () => {
  it("creates a project", async () => {
    await api.createProject("/p/new", "New");
    expect(lastCall()).toMatchObject({ url: "/api/projects", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ root: "/p/new", name: "New" });
  });

  it("imports and probes media", async () => {
    await api.importMedia("/p", "/src/a.mp4");
    expect(lastCall()).toMatchObject({ url: "/api/media/import", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({
      projectRoot: "/p",
      sourcePath: "/src/a.mp4",
      mode: "copy",
    });

    await api.probeMedia("/p/a.mp4");
    expect(lastCall()).toMatchObject({ url: "/api/media/probe", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ path: "/p/a.mp4" });
  });

  it("saves the transcript, script and storyboard", async () => {
    await api.saveTranscript("/p", {
      schemaVersion: 1,
      words: [],
      segments: [],
      removedWordIds: [],
    });
    expect(lastCall()).toMatchObject({ url: "/api/transcript", method: "PUT" });

    await api.saveScript("/p", "hello");
    expect(lastCall()).toMatchObject({ url: "/api/script", method: "PUT" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ root: "/p", script: "hello" });

    await api.saveStoryboard("/p", { schemaVersion: 1, scenes: [] });
    expect(lastCall()).toMatchObject({ url: "/api/storyboard", method: "PUT" });
  });

  it("freezes the master and previews the storyboard", async () => {
    await api.freezeMaster("/p");
    expect(lastCall()).toMatchObject({ url: "/api/cleanup/freeze", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ root: "/p" });

    await api.previewStoryboard({ root: "/p", tier: "full", version: 2, geometry: { fps: 30, width: 1280, height: 720 } });
    expect(lastCall()).toMatchObject({ url: "/api/storyboard/preview", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({
      root: "/p",
      tier: "full",
      version: 2,
      geometry: { fps: 30, width: 1280, height: 720 },
    });
  });

  it("checks and deletes prunable assets", async () => {
    await api.checkPrunableAssets("/p");
    expect(lastCall()).toMatchObject({ url: "/api/storyboard/prune", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ root: "/p" });

    await api.deletePrunableAssets("/p");
    expect(lastCall()).toMatchObject({ url: "/api/storyboard/prune", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ root: "/p", apply: true });
  });

  it("exports the storyboard with its full body", async () => {
    const body = {
      root: "/p",
      outputPath: "/p/exports/final.mp4",
      preset: "web-h264" as const,
      includeBrand: true,
      brand: {
        title: { text: "Demo" },
        outro: { text: "Thanks" },
        contact: { name: "Team" },
        lowerThird: { name: "Team" },
        loudnessLufs: -16,
      },
      geometry: { fps: 30, width: 1280, height: 720 },
    };
    await api.exportStoryboard(body);
    expect(lastCall()).toMatchObject({ url: "/api/storyboard/export", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual(body);
  });

  it("estimates and generates image and video assets", async () => {
    await api.estimateImage("/p", "g1", "a diagram");
    expect(lastCall()).toMatchObject({ url: "/api/storyboard/generate-image", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({
      root: "/p",
      sceneId: "g1",
      prompt: "a diagram",
      dryRun: true,
    });

    await api.generateImage("/p", "g1", "a diagram");
    expect(JSON.parse(String(lastCall().body))).toEqual({
      root: "/p",
      sceneId: "g1",
      prompt: "a diagram",
    });

    await api.estimateVideo("/p", "v1", "a clip", 4);
    expect(lastCall()).toMatchObject({ url: "/api/storyboard/generate-video", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({
      root: "/p",
      sceneId: "v1",
      prompt: "a clip",
      durationSeconds: 4,
      dryRun: true,
    });

    await api.generateVideo("/p", "v1", "a clip", 4);
    expect(JSON.parse(String(lastCall().body))).toEqual({
      root: "/p",
      sceneId: "v1",
      prompt: "a clip",
      durationSeconds: 4,
    });
  });

  it("transcribes one project and a batch", async () => {
    await api.transcribe("/p");
    expect(lastCall()).toMatchObject({ url: "/api/transcribe", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ projectRoot: "/p" });

    await api.transcribeBatch(["/p", "/q"]);
    expect(lastCall()).toMatchObject({ url: "/api/transcribe/batch", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ roots: ["/p", "/q"] });
  });

  it("starts a take transcript, runs a review and assembles a cut", async () => {
    await api.startTakeTranscript("/p", "take-1");
    expect(lastCall()).toMatchObject({ url: "/api/take-transcript", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ root: "/p", takeId: "take-1" });

    await api.runTakeReview("/p", "take-1");
    expect(lastCall()).toMatchObject({ url: "/api/take-review", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ root: "/p", takeId: "take-1", confirm: true });

    await api.buildCut("/p", "take-1");
    expect(lastCall()).toMatchObject({ url: "/api/assembly", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({ root: "/p", takeId: "take-1" });

    await api.renderCut("/p", "take-1");
    expect(JSON.parse(String(lastCall().body))).toEqual({ root: "/p", takeId: "take-1", render: true });
  });

  it("uploads a take as a JSON body", async () => {
    fetchMock.mockResolvedValue(
      reply({ id: "job-1", kind: "capture", status: "queued", progress: 0 }),
    );
    await api.uploadTake({
      root: "/p",
      takeId: "take-1",
      durationSeconds: 1.5,
      dataBase64: "abc",
    });
    expect(lastCall()).toMatchObject({ url: "/api/takes", method: "POST" });
    expect(JSON.parse(String(lastCall().body))).toEqual({
      root: "/p",
      takeId: "take-1",
      durationSeconds: 1.5,
      dataBase64: "abc",
    });
  });
});

describe("error mapping", () => {
  it("maps a JSON error field to an Error message", async () => {
    fetchMock.mockResolvedValue(reply({ error: "no folder at /x" }, 404));
    await expect(api.getProject("/x")).rejects.toThrow("no folder at /x");
  });

  it("falls back to the HTTP status when no error field is present", async () => {
    fetchMock.mockResolvedValue(reply({}, 500));
    await expect(api.getProject("/x")).rejects.toThrow("HTTP 500");
  });

  it("maps an upload failure to its error or the upload status", async () => {
    fetchMock.mockResolvedValue(reply({ error: "too large" }, 413));
    await expect(
      api.uploadTake({ root: "/p", takeId: "t", durationSeconds: 1, dataBase64: "x" }),
    ).rejects.toThrow("too large");

    fetchMock.mockResolvedValue(reply(null, 500));
    await expect(
      api.uploadTake({ root: "/p", takeId: "t", durationSeconds: 1, dataBase64: "x" }),
    ).rejects.toThrow("upload 500");
  });
});
