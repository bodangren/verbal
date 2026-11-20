import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import {
  ProjectError,
  formatContentRange,
  formatUnsatisfiableRange,
  nodeFileSystem,
  openProject,
  parseByteRange,
  resolveMediaPath,
  type ByteRange,
  type FileSystem,
} from "@verbal/core";

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".ogv": "video/ogg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

/** The content type for a media file, by extension. */
export function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export type MediaFile = {
  path: string;
  size: number;
};

/** The status, headers, and body decision for one media request. */
export type MediaResponsePlan = {
  status: 200 | 206 | 416;
  headers: Record<string, string>;
  range: ByteRange | null;
  /** False for HEAD and for 416, where the headers are the whole answer. */
  body: boolean;
};

/**
 * Decides how to answer a media request.
 *
 * Pure so the header contract (the part Chromium silently depends on for
 * scrubbing) is testable without a socket or a file.
 */
export function planMediaResponse(input: {
  method: string;
  rangeHeader: string | null;
  size: number;
  mimeType: string;
}): MediaResponsePlan {
  const { method, rangeHeader, size, mimeType } = input;
  const body = method !== "HEAD";
  const range = parseByteRange(rangeHeader, size);

  if (range === "unsatisfiable") {
    return {
      status: 416,
      headers: {
        "Content-Range": formatUnsatisfiableRange(size),
        "Accept-Ranges": "bytes",
      },
      range: null,
      body: false,
    };
  }

  const base = {
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    // The file can change between requests (re-import), so ranges must not be
    // served from a stale cache.
    "Cache-Control": "no-store",
  };

  if (range === null) {
    return {
      status: 200,
      headers: { ...base, "Content-Length": String(size) },
      range: null,
      body,
    };
  }

  return {
    status: 206,
    headers: {
      ...base,
      "Content-Length": String(range.end - range.start + 1),
      "Content-Range": formatContentRange(range, size),
    },
    range,
    body,
  };
}

export type MediaFileDeps = {
  fs: FileSystem;
  statSize: (filePath: string) => Promise<number>;
  openStream: (filePath: string, range: ByteRange | null) => Readable;
};

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Serves the media a project references, with byte-range support. */
export function createMediaFileApi(overrides: Partial<MediaFileDeps> = {}) {
  const deps: MediaFileDeps = {
    fs: nodeFileSystem,
    statSize: async (filePath) => (await stat(filePath)).size,
    openStream: (filePath, range) =>
      range === null
        ? createReadStream(filePath)
        : createReadStream(filePath, { start: range.start, end: range.end }),
    ...overrides,
  };

  return {
    /** Resolves the project's media to an absolute path and its size. */
    async resolve(root: string): Promise<MediaFile> {
      const project = await openProject(deps.fs, root);
      const filePath = resolveMediaPath(project, root);

      if (filePath === null) {
        throw new ProjectError("not-found", `the project at ${root} has no media`);
      }

      let size: number;
      try {
        size = await deps.statSize(filePath);
      } catch (error) {
        if (isNotFound(error)) {
          throw new ProjectError("not-found", `no media file at ${filePath}`);
        }
        throw error;
      }

      return { path: filePath, size };
    },

    /** Streams the file, or the requested part of it. */
    async send(
      request: IncomingMessage,
      response: ServerResponse,
      file: MediaFile,
    ): Promise<void> {
      const plan = planMediaResponse({
        method: request.method ?? "GET",
        rangeHeader: request.headers.range ?? null,
        size: file.size,
        mimeType: mimeTypeFor(file.path),
      });

      response.statusCode = plan.status;
      for (const [name, value] of Object.entries(plan.headers)) {
        response.setHeader(name, value);
      }

      if (!plan.body) {
        response.end();
        return;
      }

      const stream = deps.openStream(file.path, plan.range);
      // The file can vanish mid-stream; failing the socket is better than
      // leaving the response open forever.
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    },
  };
}
