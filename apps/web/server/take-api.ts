import { randomUUID } from "node:crypto";
import { createWriteStream, promises as nodeFs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  nodeFileSystem,
  openProject,
  ProjectError,
  replaceProjectMedia,
  saveProject,
  type FileSystem,
  type JobRegistry,
  type MediaRevisionStat,
} from "@verbal/core";
import { failure } from "./api-errors";
import { PayloadTooLargeError } from "./http";
import type { ApiResponse } from "./jobs-api";
import type { NormalizeJobInput } from "./normalize-job";
import { withProjectLock } from "./project-lock";
import { addTake, readTakes, TAKES_DIR } from "./take-store";
import { asRecord, requireAbsolutePath } from "./validation";

/** A 30-minute 1080p WebM is well under this; it is a guard, not a target. */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
/** Base64 grows a body by 4/3. The extra 64 KiB covers the JSON envelope. */
export const MAX_UPLOAD_BODY_BYTES = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 + 64 * 1024;
const BASE64_CHUNK_CHARS = 4 * 1024 * 1024;
const TAKE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Counts the decoded bytes from the text length alone. Nothing is decoded. */
export function decodedBase64Bytes(encoded: string): number {
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.floor((encoded.length * 3) / 4) - padding;
}

function* decodeBase64Chunks(encoded: string): Generator<Buffer> {
  for (let start = 0; start < encoded.length; start += BASE64_CHUNK_CHARS) {
    yield Buffer.from(encoded.slice(start, start + BASE64_CHUNK_CHARS), "base64");
  }
}

/** Writes the decoded bytes to a private temporary file, then moves it into place. */
async function writeRecording(encoded: string, target: string): Promise<void> {
  const tempPath = `${target}.${randomUUID()}.part`;
  try {
    await pipeline(
      Readable.from(decodeBase64Chunks(encoded)),
      createWriteStream(tempPath, { mode: 0o600 }),
    );
    await nodeFs.rename(tempPath, target);
  } catch (error) {
    await nodeFs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export function normalizeTakeId(value: unknown): string {
  if (typeof value !== "string" || !TAKE_ID.test(value)) {
    throw new ProjectError("invalid-document", "takeId must be a short slug");
  }
  return value;
}

export function uploadedTakePath(root: string, takeId: string): string {
  return path.join(root, TAKES_DIR, `${takeId}.upload`);
}

export function normalizedTakePath(root: string, takeId: string): string {
  return path.join(root, TAKES_DIR, `${takeId}.mp4`);
}

export type TakeApiDeps = {
  registry: JobRegistry;
  runNormalize: (input: NormalizeJobInput) => Promise<void>;
  fs?: FileSystem;
  now?: () => Date;
  maxUploadBytes?: number;
  stat?: (path: string) => Promise<MediaRevisionStat>;
};

/**
 * Lists a project's takes and accepts one browser recording.
 *
 * The upload is written to a temporary `.upload` file, normalized to MP4, and
 * only then added to `takes.json` and made the project media. A failed
 * normalize leaves neither a partial MP4 nor a manifest entry.
 */
export function createTakeApi(overrides: TakeApiDeps) {
  const fs = overrides.fs ?? nodeFileSystem;
  const now = overrides.now ?? (() => new Date());
  const maxUploadBytes = overrides.maxUploadBytes ?? MAX_UPLOAD_BYTES;
  const stat =
    overrides.stat ??
    (async (mediaPath: string) => {
      const info = await nodeFs.stat(mediaPath);
      return { size: info.size, mtimeMs: info.mtimeMs };
    });

  return {
    async list(input: unknown): Promise<ApiResponse> {
      try {
        const body = asRecord(input);
        const root = requireAbsolutePath(body.root, "root");
        return { status: 200, body: await readTakes(fs, root) };
      } catch (error) {
        return failure(error);
      }
    },

    async upload(input: {
      root: unknown;
      takeId: unknown;
      durationSeconds: unknown;
      dataBase64: string;
    }): Promise<ApiResponse> {
      try {
        const root = requireAbsolutePath(input.root, "root");
        const takeId = normalizeTakeId(input.takeId);
        const duration = input.durationSeconds;

        if (
          typeof duration !== "number" ||
          !Number.isFinite(duration) ||
          duration <= 0 ||
          duration > 3600
        ) {
          throw new ProjectError("invalid-document", "duration must be between 0 and 3600");
        }
        const decodedBytes = decodedBase64Bytes(input.dataBase64);
        if (decodedBytes > maxUploadBytes) {
          throw new PayloadTooLargeError(maxUploadBytes);
        }
        if (decodedBytes <= 0) {
          throw new ProjectError("invalid-document", "recording is empty");
        }

        await openProject(fs, root);
        await nodeFs.mkdir(path.join(root, TAKES_DIR), { recursive: true });

        const uploadPath = uploadedTakePath(root, takeId);
        await writeRecording(input.dataBase64, uploadPath);

        const outputPath = normalizedTakePath(root, takeId);
        const fileName = `${takeId}.mp4`;
        const job = await overrides.registry.create("capture");

        void overrides
          .runNormalize({
            jobId: job.id,
            inputPath: uploadPath,
            outputPath,
            durationSeconds: duration,
            onOutput: async () => {
              await addTake(fs, root, {
                id: takeId,
                fileName,
                createdAt: now().toISOString(),
                durationSeconds: duration,
              });
              await withProjectLock(root, async () => {
                // Re-read inside the lock: the normalize ran since the fail-fast read.
                const current = await openProject(fs, root);
                const updated = await replaceProjectMedia(
                  current,
                  { assetPath: `takes/${fileName}` },
                  { mediaPath: outputPath, stat },
                );
                await saveProject(fs, root, updated);
              });
            },
          })
          .finally(() => {
            void nodeFs.unlink(uploadPath).catch(() => undefined);
          });

        return { status: 202, body: job };
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          return { status: 413, body: { error: error.message } };
        }
        return failure(error);
      }
    },
  };
}
