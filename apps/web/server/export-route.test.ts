import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

const { runExport, create, probeMedia, realpath } = vi.hoisted(() => ({
  runExport: vi.fn(),
  create: vi.fn(),
  probeMedia: vi.fn(),
  realpath: vi.fn(async (path: string) => path),
}));

vi.mock("@verbal/media", () => ({
  buildCutList: () => ({ kept: [{ start: 0, end: 1 }] }),
  probeMedia,
  runCommand: vi.fn(),
  resolveExportDestination: async (source: string, destination: string, realpath: (path: string) => Promise<string>) => {
    const [left, right] = await Promise.all([realpath(source), realpath(destination)]);
    if (left.toLowerCase() === right.toLowerCase()) throw new Error("outputPath must not be the source video");
  },
  runExport,
}));
vi.mock("@verbal/media/presets", () => ({
  resolvePreset: () => ({ id: "default", codecs: {} }),
  withPresetExtension: (path: string) => path,
}));
vi.mock("@verbal/core", () => ({
  nodeFileSystem: {
    readFile: vi.fn(async () => Buffer.from("{}")),
    realpath,
  },
  openProject: async () => ({ media: { externalPath: "/source.mp4" } }),
  parseTranscript: () => ({}),
  projectPaths: () => ({ transcript: "/transcript.json" }),
  resolveInsideProject: (_root: string, path: string) => path,
}));
vi.mock("node:fs/promises", () => ({ realpath }));
vi.mock("./registry", () => ({ getJobRegistry: async () => ({ create }) }));
vi.mock("./export-job", () => ({ runExportJob: vi.fn() }));
vi.mock("./api-errors", () => ({ failure: (error: Error) => ({ status: 400, body: { error: error.message } }) }));

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
