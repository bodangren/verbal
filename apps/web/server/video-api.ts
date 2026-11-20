import { projectPaths, writeFileAtomic, type FileSystem, type JobRegistry } from "@verbal/core";
import type { VideoProvider, VideoRequest } from "@verbal/ai";
import { serializeStoryboard, type StoryboardDocument } from "@verbal/storyboard";
import type { AssetRecord, AssetStore } from "@verbal/compose";
import { failure } from "./api-errors";
import type { ApiResponse } from "./jobs-api";
import { readStoryboard } from "./storyboard-api";
import { asRecord, requireAbsolutePath } from "./validation";
import { runVideoJob } from "./video-job";

export type VideoApiDeps = {
  fs: FileSystem;
  registry: JobRegistry;
  assets: AssetStore;
  provider: VideoProvider;
  now: () => Date;
  /** Injectable for tests; defaults to the real job runner. */
  runJob?: (
    jobId: string,
    sceneId: string,
    request: VideoRequest,
  ) => Promise<AssetRecord | null>;
};

/**
 * Generates a clip for a storyboard scene.
 *
 * A dry run returns the price and creates nothing. Generation runs as a job,
 * so it is cancellable and outlives the request.
 */
export async function generateSceneVideo(
  deps: VideoApiDeps,
  input: unknown,
): Promise<ApiResponse> {
  try {
    const body = asRecord(input);
    const root = requireAbsolutePath(body.root, "root");
    const sceneId = typeof body.sceneId === "string" ? body.sceneId : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const duration = body.durationSeconds;

    if (sceneId === "" || prompt === "") {
      return { status: 400, body: { error: "sceneId and prompt are required" } };
    }

    if (
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration < 1 ||
      duration > 60
    ) {
      return { status: 400, body: { error: "durationSeconds must be between 1 and 60" } };
    }

    const storyboard = await readStoryboard(deps.fs, root);
    const index = storyboard.scenes.findIndex((scene) => scene.id === sceneId);

    if (index === -1) {
      return { status: 400, body: { error: `unknown scene: ${sceneId}` } };
    }

    const scene = storyboard.scenes[index];
    if (scene === undefined || scene.visual !== "generated-video") {
      return { status: 400, body: { error: "scene is not a generated video" } };
    }

    const request: VideoRequest = {
      prompt,
      durationSeconds: duration,
      ...(typeof body.width === "number" ? { width: body.width } : {}),
      ...(typeof body.height === "number" ? { height: body.height } : {}),
    };

    if (body.dryRun === true) {
      return {
        status: 200,
        body: {
          estimate: deps.provider.estimateCost(request),
          provider: deps.provider.id,
        },
      };
    }

    const job = await deps.registry.create("generate-video");
    const runJob =
      deps.runJob ??
      ((jobId, targetSceneId, videoRequest) =>
        runVideoJob(deps, { jobId, sceneId: targetSceneId, request: videoRequest }));

    void (async () => {
      const record = await runJob(job.id, sceneId, request);
      if (record === null) {
        return;
      }

      const current = await readStoryboard(deps.fs, root);
      const scenes = current.scenes.map((entry) =>
        entry.id === sceneId ? { ...entry, assetId: record.id } : entry,
      );
      const document: StoryboardDocument = { ...current, scenes };

      await writeFileAtomic(
        deps.fs,
        projectPaths(root).storyboard,
        serializeStoryboard(document),
      );
    })().catch(() => undefined);

    return { status: 202, body: job };
  } catch (error) {
    return failure(error);
  }
}
