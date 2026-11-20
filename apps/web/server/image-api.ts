import { projectPaths, writeFileAtomic, type FileSystem } from "@verbal/core";
import type { ImageProvider, ImageRequest } from "@verbal/ai";
import { serializeStoryboard, type StoryboardDocument } from "@verbal/storyboard";
import type { AssetStore } from "@verbal/compose";
import { failure } from "./api-errors";
import type { ApiResponse } from "./jobs-api";
import { readStoryboard } from "./storyboard-api";
import { asRecord, requireAbsolutePath } from "./validation";

export type ImageApiDeps = {
  fs: FileSystem;
  assets: AssetStore;
  provider: ImageProvider;
  now: () => Date;
};

/**
 * Generates an image for a storyboard scene.
 *
 * A dry run returns the price and touches nothing; the caller shows that cost
 * before deciding to generate.
 */
export async function generateSceneImage(
  deps: ImageApiDeps,
  input: unknown,
): Promise<ApiResponse> {
  try {
    const body = asRecord(input);
    const root = requireAbsolutePath(body.root, "root");
    const sceneId = typeof body.sceneId === "string" ? body.sceneId : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (sceneId === "" || prompt === "") {
      return { status: 400, body: { error: "sceneId and prompt are required" } };
    }

    const storyboard = await readStoryboard(deps.fs, root);
    const index = storyboard.scenes.findIndex((scene) => scene.id === sceneId);

    if (index === -1) {
      return { status: 400, body: { error: `unknown scene: ${sceneId}` } };
    }

    const scene = storyboard.scenes[index];
    if (scene === undefined || scene.visual !== "generated-image") {
      return { status: 400, body: { error: "scene is not a generated image" } };
    }

    const request: ImageRequest = {
      prompt,
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

    const image = await deps.provider.generate(request);
    const { record } = await deps.assets.put({
      data: image.data,
      mediaType: image.mediaType,
      source: "generated",
      prompt,
      model: image.model,
      createdAt: deps.now().toISOString(),
    });

    const scenes = storyboard.scenes.map((entry, position) =>
      position === index ? { ...entry, assetId: record.id } : entry,
    );
    const document: StoryboardDocument = { ...storyboard, scenes };

    await writeFileAtomic(
      deps.fs,
      projectPaths(root).storyboard,
      serializeStoryboard(document),
    );

    return {
      status: 200,
      body: {
        assetId: record.id,
        cost: deps.provider.estimateCost(request),
        document,
      },
    };
  } catch (error) {
    return failure(error);
  }
}
