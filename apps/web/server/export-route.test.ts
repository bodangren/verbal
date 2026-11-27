import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createTranscript, insertSilence, moveRange, serializeTranscript } from "@verbal/core";

const { runExport, create, probeMedia, realpath, readFile, openProject } = vi.hoisted(() => ({
  runExport: vi.fn(),
  create: vi.fn(),
  probeMedia: vi.fn(),
  realpath: vi.fn(async (path: string) => path),
  readFile: vi.fn(async () => Buffer.from("{}")),
  openProject: vi.fn(
    async (): Promise<{ media: { externalPath: string; mediaRevision?: string } }> => ({
      media: { externalPath: "/source.mp4" },
    }),
  ),
}));

vi.mock("@verbal/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbal/media")>();
  return {
    ...actual,
    probeMedia,
    runCommand: vi.fn(),
    resolveExportDestination: async (
      source: string,
      destination: string,
      realpath: (path: string) => Promise<string>,
    ) => {
      const [left, right] = await Promise.all([realpath(source), realpath(destination)]);
      if (left.toLowerCase() === right.toLowerCase()) {
        throw new Error("outputPath must not be the source video");
      }
    },
    runExport,
  };
});
vi.mock("@verbal/media/presets", () => ({
  resolvePreset: () => ({ id: "default", codecs: {} }),
  withPresetExtension: (path: string) => path,
}));
vi.mock("@verbal/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbal/core")>();
  return {
    ...actual,
    nodeFileSystem: {
      readFile,
      realpath,
    },
    openProject,
    projectPaths: () => ({ transcript: "/transcript.json" }),
    resolveInsideProject: (_root: string, path: string) => path,
  };
});
vi.mock("node:fs/promises", () => ({ realpath }));
vi.mock("./registry", () => ({ getJobRegistry: async () => ({ create }) }));
vi.mock("./export-job", () => ({
  runExportJob: vi.fn(
    (
      _registry: unknown,
      _jobId: string,
      work: (report: () => void, signal: AbortSignal) => Promise<unknown>,
    ) => work(() => undefined, new AbortController().signal),
  ),
}));
vi.mock("./api-errors", () => ({
  failure: (error: Error) => ({ status: 400, body: { error: error.message } }),
}));

import handler from "../pages/api/export";

function request(body: unknown): IncomingMessage {
  const request = new EventEmitter() as IncomingMessage;
  request.method = "POST";
  request.headers = {};
  (request as unknown as AsyncIterable<Buffer>)[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(JSON.stringify(body));
  };
  return request;
}

function response(): ServerResponse & { statusCode?: number; body?: unknown } {
  const result: { statusCode?: number; body?: unknown; writeHead(status: number): unknown; setHeader(): unknown; end(body: string): void } = {
    writeHead(status: number) {
      result.statusCode = status;
      return result;
    },
    setHeader() {
      return result;
    },
    end(body: string) {
      result.body = JSON.parse(body);
    },
  };
  return result as unknown as ServerResponse & { statusCode?: number; body?: unknown };
}

describe("POST /api/export destination safety", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects a destination equal to the source before creating a job", async () => {
    probeMedia.mockResolvedValue({ durationSeconds: 1, streams: [] });
    create.mockResolvedValue({ id: "job-1" });
    const res = response();
    await handler(request({ projectRoot: "/project", outputPath: "/source.mp4" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "outputPath must not be the source video" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a destination symlink to the source before creating a job", async () => {
    realpath.mockImplementation(async (path: string) =>
      path === "/alias.mp4" ? "/source.mp4" : path,
    );
    probeMedia.mockResolvedValue({ durationSeconds: 1, streams: [] });
    const res = response();
    await handler(request({ projectRoot: "/project", outputPath: "/alias.mp4" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "outputPath must not be the source video" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /api/export timeline", () => {
  afterEach(() => vi.clearAllMocks());

  it("passes a reordered transcript's pieces in the new order to the runner", async () => {
    const transcript = moveRange(
      createTranscript([
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 1, end: 2 },
        { text: "three", start: 2, end: 3 },
      ]),
      1,
      1,
      2,
    );
    readFile.mockResolvedValue(Buffer.from(serializeTranscript(transcript)));
    probeMedia.mockResolvedValue({
      durationSeconds: 3,
      streams: [
        { kind: "video", width: 1920, height: 1080, frameRate: 30 },
        { kind: "audio" },
      ],
    });
    create.mockResolvedValue({ id: "job-1" });

    const res = response();
    await handler(request({ projectRoot: "/project", outputPath: "/out.mp4" }), res);

    expect(res.statusCode).toBe(202);
    expect(runExport).toHaveBeenCalledTimes(1);
    const input = runExport.mock.calls[0]?.[0] as { items: unknown[] };
    expect(input.items).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1 },
      { kind: "video", startSeconds: 2, endSeconds: 3 },
      { kind: "video", startSeconds: 1, endSeconds: 2 },
    ]);
  });

  it("passes an inserted silence to the runner", async () => {
    const transcript = insertSilence(
      createTranscript([
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 1, end: 2 },
      ]),
      "w0",
      1.5,
    );
    readFile.mockResolvedValue(Buffer.from(serializeTranscript(transcript)));
    probeMedia.mockResolvedValue({
      durationSeconds: 2,
      streams: [
        { kind: "video", width: 1280, height: 720, frameRate: 25 },
        { kind: "audio" },
      ],
    });
    create.mockResolvedValue({ id: "job-2" });

    const res = response();
    await handler(request({ projectRoot: "/project", outputPath: "/out.mp4" }), res);

    expect(res.statusCode).toBe(202);
    expect(runExport).toHaveBeenCalledTimes(1);
    const input = runExport.mock.calls[0]?.[0] as {
      items: unknown[];
      video: { width: number; height: number; fps: number };
    };
    expect(input.items).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1 },
      { kind: "silence", durationSeconds: 1.5 },
      { kind: "video", startSeconds: 1, endSeconds: 2 },
    ]);
    expect(input.video).toEqual({ width: 1280, height: 720, fps: 25 });
  });

  it("passes the display geometry to the runner for a rotated source", async () => {
    const transcript = insertSilence(
      createTranscript([
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 1, end: 2 },
      ]),
      "w0",
      1.5,
    );
    readFile.mockResolvedValue(Buffer.from(serializeTranscript(transcript)));
    probeMedia.mockResolvedValue({
      durationSeconds: 2,
      streams: [
        {
          kind: "video",
          width: 160,
          height: 120,
          displayWidth: 120,
          displayHeight: 160,
          frameRate: 25,
          rotation: 90,
        },
        { kind: "audio" },
      ],
    });
    create.mockResolvedValue({ id: "job-rot" });

    const res = response();
    await handler(request({ projectRoot: "/project", outputPath: "/out.mp4" }), res);

    expect(res.statusCode).toBe(202);
    const input = runExport.mock.calls[0]?.[0] as {
      video: { width: number; height: number; fps: number };
    };
    expect(input.video).toEqual({ width: 120, height: 160, fps: 25 });
  });

  it("extends an unedited transcript to the probed media duration", async () => {
    const transcript = createTranscript([
      { text: "start", start: 2, end: 30 },
      { text: "end", start: 31, end: 58 },
    ]);
    readFile.mockResolvedValue(Buffer.from(serializeTranscript(transcript)));
    probeMedia.mockResolvedValue({
      durationSeconds: 60,
      streams: [
        { kind: "video", width: 1920, height: 1080, frameRate: 30 },
        { kind: "audio" },
      ],
    });
    create.mockResolvedValue({ id: "job-3" });

    const res = response();
    await handler(request({ projectRoot: "/project", outputPath: "/out.mp4" }), res);

    expect(res.statusCode).toBe(202);
    const input = runExport.mock.calls[0]?.[0] as { items: unknown[] };
    expect(input.items).toEqual([{ kind: "video", startSeconds: 0, endSeconds: 60 }]);
  });
});

describe("POST /api/export transcript media revision", () => {
  afterEach(() => vi.clearAllMocks());

  it("answers 409 when the transcript belongs to different media", async () => {
    openProject.mockResolvedValueOnce({
      media: { externalPath: "/source.mp4", mediaRevision: "rev-media" },
    });
    const transcript = { ...createTranscript([{ text: "one", start: 0, end: 1 }]), mediaRevision: "rev-transcript" };
    readFile.mockResolvedValue(Buffer.from(serializeTranscript(transcript)));

    const res = response();
    await handler(request({ projectRoot: "/project", outputPath: "/out.mp4" }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: "The transcript belongs to different media. Transcribe again.",
    });
    expect(create).not.toHaveBeenCalled();
    expect(probeMedia).not.toHaveBeenCalled();
  });

  it("exports when the transcript and media revisions match", async () => {
    openProject.mockResolvedValueOnce({
      media: { externalPath: "/source.mp4", mediaRevision: "rev-same" },
    });
    const transcript = { ...createTranscript([{ text: "one", start: 0, end: 1 }]), mediaRevision: "rev-same" };
    readFile.mockResolvedValue(Buffer.from(serializeTranscript(transcript)));
    probeMedia.mockResolvedValue({ durationSeconds: 1, streams: [] });
    create.mockResolvedValue({ id: "job-1" });

    const res = response();
    await handler(request({ projectRoot: "/project", outputPath: "/out.mp4" }), res);

    expect(res.statusCode).toBe(202);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
