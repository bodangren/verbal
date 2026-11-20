import path from "node:path";
import {
  openProject,
  saveProject,
  type FileSystem,
  type JobRegistry,
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

    void (async () => {
      await deps.runCapture(job.id, request);

      if (deps.registry.get(job.id)?.status === "done") {
        await saveProject(deps.fs, root, {
          ...project,
          media: { assetPath: `assets/${fileName}` },
        });
      }
    })().catch(() => undefined);

    return { status: 202, body: job };
  } catch (error) {
    return failure(error);
  }
}
