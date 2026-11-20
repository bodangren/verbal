import type { JobRegistry } from "@verbal/core";
import type { VideoProvider, VideoRequest } from "@verbal/ai";
import type { AssetRecord, AssetStore } from "@verbal/compose";

export type VideoJobDeps = {
  registry: JobRegistry;
  assets: AssetStore;
  provider: VideoProvider;
  now: () => Date;
  signal?: AbortSignal;
};

/**
 * Generates one clip and stores it as a content-addressed asset.
 *
 * Returns the stored record on success, or null when the job failed or was
 * cancelled. The caller decides whether to attach it to a scene.
 */
export async function runVideoJob(
  deps: VideoJobDeps,
  input: { jobId: string; sceneId: string; request: VideoRequest },
): Promise<AssetRecord | null> {
  const controller = new AbortController();
  const signal = deps.signal ?? controller.signal;

  try {
    await deps.registry.start(input.jobId);
    await deps.registry.progress(input.jobId, 0.5, "generating clip");

    const video = await deps.provider.generate(input.request, { signal });
    const { record } = await deps.assets.put({
      data: video.data,
      mediaType: video.mediaType,
      source: "generated",
      prompt: input.request.prompt,
      model: video.model,
      createdAt: deps.now().toISOString(),
    });

    await deps.registry.complete(input.jobId, { assetId: record.id });
    return record;
  } catch (error) {
    if (signal.aborted) {
      await deps.registry.cancel(input.jobId).catch(() => undefined);
      return null;
    }

    const message = error instanceof Error ? error.message : String(error);
    await deps.registry.fail(input.jobId, message).catch(() => undefined);
    return null;
  }
}
