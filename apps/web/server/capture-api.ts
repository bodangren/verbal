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
import type { CaptureRequest } from "@verbal/media";
import { failure } from "./api-errors";
import type { ApiResponse } from "./jobs-api";
import { asRecord, requireAbsolutePath } from "./validation";

export type CaptureApiDeps = {
  fs: FileSystem;
  registry: JobRegistry;
  now: () => Date;
  runCapture: (jobId: string, request: CaptureRequest) => Promise<void>;
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

    const project = await openProject(deps.fs, root);
    const fileName = `capture-${deps.now().toISOString().replace(/[:.]/g, "-")}.mp4`;

    await deps.fs.mkdir(path.join(root, "assets"));

    const request: CaptureRequest = {
      outputPath: path.join(root, "assets", fileName),
      durationSeconds: duration,
      ...(typeof body.videoDevice === "string" ? { videoDevice: body.videoDevice } : {}),
      ...(typeof body.audioDevice === "string" ? { audioDevice: body.audioDevice } : {}),
    };

    const job = await deps.registry.create("capture");

    const stat =
      deps.stat ??
      (async (mediaPath: string) => {
        const info = await statFile(mediaPath);
        return { size: info.size, mtimeMs: info.mtimeMs };
      });

    void (async () => {
      await deps.runCapture(job.id, request);

      if (deps.registry.get(job.id)?.status === "done") {
        const updated = await replaceProjectMedia(
          project,
          { assetPath: `assets/${fileName}` },
          { mediaPath: request.outputPath, stat },
        );
        await saveProject(deps.fs, root, updated);
      }
    })().catch(() => undefined);

    return { status: 202, body: job };
  } catch (error) {
    return failure(error);
  }
}
