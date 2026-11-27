import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createTranscript, type ProjectDocument } from "@verbal/core";

const { openProject, saveTranscript, readFile } = vi.hoisted(() => ({
  openProject: vi.fn(),
  saveTranscript: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("@verbal/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbal/core")>();
  return {
    ...actual,
    nodeFileSystem: { readFile },
    openProject,
    saveTranscript,
    projectPaths: () => ({ transcript: "/transcript.json" }),
  };
});

import handler from "../pages/api/transcript";

function project(mediaRevision?: string): ProjectDocument {
  return {
    schemaVersion: 1,
    id: "p1",
    name: "Demo",
    createdAt: "2026-11-21T00:00:00.000Z",
    media:
      mediaRevision === undefined
        ? { assetPath: "assets/a.mp4" }
        : { assetPath: "assets/a.mp4", mediaRevision },
  };
}

function request(body: unknown): IncomingMessage {
  const request = new EventEmitter() as IncomingMessage;
  request.method = "PUT";
  request.headers = {};
  (request as unknown as AsyncIterable<Buffer>)[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(JSON.stringify(body));
  };
  return request;
}

function response(): ServerResponse & { statusCode?: number; body?: unknown } {
  const result: {
    statusCode?: number;
    body?: unknown;
    writeHead(status: number): unknown;
    setHeader(): unknown;
    end(body: string): void;
  } = {
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

describe("PUT /api/transcript media revision", () => {
  afterEach(() => vi.clearAllMocks());

  it("answers 409 when the document belongs to different media", async () => {
    openProject.mockResolvedValueOnce(project("rev-media"));
    const res = response();
    const document = {
      ...createTranscript([{ text: "one", start: 0, end: 1 }]),
      mediaRevision: "rev-transcript",
    };

    await handler(request({ root: "/project", document }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: "The transcript belongs to different media. Transcribe again.",
    });
    expect(saveTranscript).not.toHaveBeenCalled();
  });

  it("saves a document whose revision matches the project", async () => {
    openProject.mockResolvedValueOnce(project("rev-same"));
    saveTranscript.mockResolvedValue(undefined);
    const document = {
      ...createTranscript([{ text: "one", start: 0, end: 1 }]),
      mediaRevision: "rev-same",
    };
    const res = response();

    await handler(request({ root: "/project", document }), res);

    expect(res.statusCode).toBe(200);
    expect(saveTranscript).toHaveBeenCalledWith(expect.anything(), "/transcript.json", document);
  });

  it("stamps a document without a revision with the project revision", async () => {
    openProject.mockResolvedValueOnce(project("rev-current"));
    saveTranscript.mockResolvedValue(undefined);
    const document = createTranscript([{ text: "one", start: 0, end: 1 }]);
    const res = response();

    await handler(request({ root: "/project", document }), res);

    expect(res.statusCode).toBe(200);
    expect(saveTranscript).toHaveBeenCalledWith(expect.anything(), "/transcript.json", {
      ...document,
      mediaRevision: "rev-current",
    });
    expect(res.body).toEqual({ ...document, mediaRevision: "rev-current" });
  });

  it("accepts a document without a revision when the project has no revision either", async () => {
    openProject.mockResolvedValueOnce(project());
    saveTranscript.mockResolvedValue(undefined);
    const document = createTranscript([{ text: "one", start: 0, end: 1 }]);
    const res = response();

    await handler(request({ root: "/project", document }), res);

    expect(res.statusCode).toBe(200);
    expect(saveTranscript).toHaveBeenCalledWith(expect.anything(), "/transcript.json", document);
  });
});
