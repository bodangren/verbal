import path from "node:path";
import { stat as statFile } from "node:fs/promises";
import {
  openProject,
  replaceProjectMedia,
  saveProject,
  type FileSystem,
  type JobRegistry,
  type MediaRevisionStat,
} from "@verbal/core";
import { failure } from "./api-errors";
import type { CaptureJobRequest } from "./capture-job";
import type { ApiResponse } from "./jobs-api";
import { withProjectLock } from "./project-lock";
import { asRecord, requireAbsolutePath } from "./validation";

export type CaptureApiDeps = {
  fs: FileSystem;
  registry: JobRegistry;
  now: () => Date;
  runCapture: (jobId: string, request: CaptureJobRequest) => Promise<void>;
  stat?: (path: string) => Promise<MediaRevisionStat>;
};

/** Starts a capture and records the result as the project's media. */
export async function startCapture(
  deps: CaptureApiDeps,
  input: unknown,
): Promise<ApiResponse> {
  try {
    const body = asRecord(input);
    const root = requireAbsolutePath(body.projectRoot, "projectRoot");
    const duration = body.durationSeconds;

    if (
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 3600
    ) {
      return {
        status: 400,
        body: { error: "durationSeconds must be between 0 and 3600" },
      };
    }

    await openProject(deps.fs, root);
    const fileName = `capture-${deps.now().toISOString().replace(/[:.]/g, "-")}.mp4`;

    await deps.fs.mkdir(path.join(root, "assets"));

    const outputPath = path.join(root, "assets", fileName);
    const stat =
      deps.stat ??
      (async (mediaPath: string) => {
        const info = await statFile(mediaPath);
        return { size: info.size, mtimeMs: info.mtimeMs };
      });

    const request: CaptureJobRequest = {
      outputPath,
      durationSeconds: duration,
      ...(typeof body.videoDevice === "string" ? { videoDevice: body.videoDevice } : {}),
      ...(typeof body.audioDevice === "string" ? { audioDevice: body.audioDevice } : {}),
      onOutput: async () => {
        await withProjectLock(root, async () => {
          // Re-read inside the lock: the recording ran since the fail-fast read.
          const current = await openProject(deps.fs, root);
          const updated = await replaceProjectMedia(
            current,
            { assetPath: `assets/${fileName}` },
            { mediaPath: outputPath, stat },
          );
          await saveProject(deps.fs, root, updated);
        });
      },
    };

    const job = await deps.registry.create("capture");

    void deps.runCapture(job.id, request).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      void deps.registry.fail(job.id, message).catch(() => undefined);
    });

    return { status: 202, body: job };
  } catch (error) {
    return failure(error);
  }
}
