import { createHash } from "node:crypto";
import { canonicalJson } from "@verbal/storyboard";
import type { SlideCache } from "./cache";
import {
  SlideError,
  type SlideManifest,
  type SlideRenderRequest,
  type SlideRenderer,
} from "./types";

const PRECISION = 1_000_000;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

/**
 * Content hash for a slide render.
 *
 * Covers template, props, duration, and output geometry. The scene id is
 * excluded so renaming or reordering a scene keeps its cached frames.
 */
export function slideRequestHash(request: SlideRenderRequest): string {
  const payload = {
    template: request.template,
    props: request.props,
    durationSeconds: round(request.durationSeconds),
    fps: request.fps,
    width: request.width,
    height: request.height,
  };

  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export type SlideRenderDeps = {
  renderer: SlideRenderer;
  cache: SlideCache;
};

export type RenderOutcome =
  | {
      status: "rendered";
      hash: string;
      directory: string;
      manifest: SlideManifest;
      cached: boolean;
    }
  | { status: "placeholder"; hash: string; error: string };

/**
 * Renders one scene, reusing cached frames when possible.
 *
 * A renderer failure becomes a placeholder so the rest of the storyboard can
 * still preview. Cancellation and timeouts are propagated instead: they are
 * the caller's decision, not a missing asset.
 */
export async function renderSceneSlide(
  deps: SlideRenderDeps,
  request: SlideRenderRequest,
  options: { signal?: AbortSignal } = {},
): Promise<RenderOutcome> {
  const hash = slideRequestHash(request);
  const directory = deps.cache.directory(hash);

  const cachedManifest = await deps.cache.readManifest(hash);
  if (cachedManifest !== null) {
    return { status: "rendered", hash, directory, manifest: cachedManifest, cached: true };
  }

  try {
    const manifest = await deps.renderer.render(request, {
      outputDirectory: directory,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    await deps.cache.writeManifest(hash, manifest);

    return { status: "rendered", hash, directory, manifest, cached: false };
  } catch (error) {
    if (error instanceof SlideError && (error.code === "cancelled" || error.code === "timeout")) {
      throw error;
    }

    return {
      status: "placeholder",
      hash,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
