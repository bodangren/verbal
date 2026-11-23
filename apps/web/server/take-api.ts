import { promises as nodeFs } from "node:fs";
import path from "node:path";
import {
  nodeFileSystem,
  openProject,
  ProjectError,
  saveProject,
  type FileSystem,
  type JobRegistry,
} from "@verbal/core";
import { failure } from "./api-errors";
import type { ApiResponse } from "./jobs-api";
import type { NormalizeJobInput } from "./normalize-job";
import { addTake, readTakes, TAKES_DIR } from "./take-store";
import { asRecord, requireAbsolutePath } from "./validation";

/** A 30-minute 1080p WebM is well under this; it is a guard, not a target. */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const TAKE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

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
      data: Buffer;
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
        if (input.data.length === 0) {
          throw new ProjectError("invalid-document", "recording is empty");
        }
        if (input.data.length > MAX_UPLOAD_BYTES) {
          throw new ProjectError(
            "invalid-document",
            `upload exceeds ${MAX_UPLOAD_BYTES} bytes`,
          );
        }

        const project = await openProject(fs, root);
        await nodeFs.mkdir(path.join(root, TAKES_DIR), { recursive: true });

        const uploadPath = uploadedTakePath(root, takeId);
        await nodeFs.writeFile(uploadPath, input.data);

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
              await saveProject(fs, root, {
                ...project,
                media: { assetPath: `takes/${fileName}` },
              });
            },
          })
          .finally(() => {
            void nodeFs.unlink(uploadPath).catch(() => undefined);
          });

        return { status: 202, body: job };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
