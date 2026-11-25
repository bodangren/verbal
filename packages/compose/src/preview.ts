import { createHash } from "node:crypto";
import {
  resolveScene,
  type AnchorIndex,
  type StoryboardDocument,
  type VisualKind,
} from "@verbal/storyboard";
import { canonicalJson } from "@verbal/storyboard/hash";
import type { SlideCache } from "./cache";
import { renderSceneSlide, slideRequestHash } from "./slides";
import type { SlideRenderer, SlideRenderRequest } from "./types";

export type PreviewTier = "fast" | "full";

export type PreviewSceneSource = "cached" | "render" | "placeholder" | "asset" | "talk";

export type PreviewScene = {
  sceneId: string;
  visual: VisualKind;
  startSeconds: number;
  endSeconds: number;
  /**
   * How long the scene plays in the export, when that differs from the span.
   * A talk scene with deleted words or inserted silence plays for less or more
   * than `endSeconds - startSeconds`. Set by the caller that knows the edits.
   */
  playSeconds?: number;
  source: PreviewSceneSource;
  hash?: string;
  directory?: string;
  assetId?: string;
  /** Present only for slide scenes that may need rendering. */
  request?: SlideRenderRequest;
};

export type PreviewPlan = {
  tier: PreviewTier;
  version: number;
  storyboardHash: string;
  scenes: PreviewScene[];
};

export type PreviewGeometry = {
  fps: number;
  width: number;
  height: number;
};

export type PlanPreviewInput = {
  storyboard: StoryboardDocument;
  anchors: AnchorIndex;
  cache: SlideCache;
  tier: PreviewTier;
  version: number;
  geometry: PreviewGeometry;
};

/** Identifies the storyboard a preview was derived from, independent of tier. */
export function storyboardContentHash(storyboard: StoryboardDocument): string {
  return createHash("sha256").update(canonicalJson(storyboard)).digest("hex");
}

function stripRequest(entry: PreviewScene): Omit<PreviewScene, "request"> {
  return {
    sceneId: entry.sceneId,
    visual: entry.visual,
    startSeconds: entry.startSeconds,
    endSeconds: entry.endSeconds,
    ...(entry.playSeconds === undefined ? {} : { playSeconds: entry.playSeconds }),
    source: entry.source,
    ...(entry.hash === undefined ? {} : { hash: entry.hash }),
    ...(entry.directory === undefined ? {} : { directory: entry.directory }),
    ...(entry.assetId === undefined ? {} : { assetId: entry.assetId }),
  };
}

/**
 * Plans a preview without doing any rendering.
 *
 * The fast tier never plans a render: uncached slides become placeholders, so
 * switching to fast preview cannot start Chromium. The full tier plans a
 * render for every uncached slide.
 */
export async function planPreview(input: PlanPreviewInput): Promise<PreviewPlan> {
  const scenes: PreviewScene[] = [];

  for (const scene of input.storyboard.scenes) {
    const { startSeconds, endSeconds } = resolveScene(scene, input.anchors);
    const base = {
      sceneId: scene.id,
      visual: scene.visual,
      startSeconds,
      endSeconds,
    };

    if (scene.visual === "talk") {
      scenes.push({ ...base, source: "talk" });
      continue;
    }

    const isAsset =
      scene.visual === "static" ||
      scene.visual === "generated-image" ||
      scene.visual === "generated-video";

    if (isAsset || scene.template === undefined) {
      scenes.push({
        ...base,
        source: scene.assetId === undefined ? "placeholder" : "asset",
        ...(scene.assetId === undefined ? {} : { assetId: scene.assetId }),
      });
      continue;
    }

    const request: SlideRenderRequest = {
      sceneId: scene.id,
      template: scene.template,
      props: scene.props ?? {},
      durationSeconds: endSeconds - startSeconds,
      fps: input.geometry.fps,
      width: input.geometry.width,
      height: input.geometry.height,
    };
    const hash = slideRequestHash(request);
    const cached = await input.cache.has(hash);

    scenes.push({
      ...base,
      source: cached ? "cached" : input.tier === "fast" ? "placeholder" : "render",
      hash,
      directory: input.cache.directory(hash),
      request,
    });
  }

  return {
    tier: input.tier,
    version: input.version,
    storyboardHash: storyboardContentHash(input.storyboard),
    scenes,
  };
}

export type PreviewExecutedScene = Omit<PreviewScene, "request"> & {
  error?: string;
};

export type PreviewExecution = {
  tier: PreviewTier;
  version: number;
  storyboardHash: string;
  scenes: PreviewExecutedScene[];
};

export type ExecutePreviewDeps = {
  renderer: SlideRenderer;
  cache: SlideCache;
};

/**
 * Carries out a plan.
 *
 * Only entries planned as `render` invoke the renderer. Everything else is
 * passed through, which is what makes the fast tier cheap.
 */
export async function executePreviewPlan(
  deps: ExecutePreviewDeps,
  plan: PreviewPlan,
  options: { signal?: AbortSignal } = {},
): Promise<PreviewExecution> {
  const scenes: PreviewExecutedScene[] = [];

  for (const entry of plan.scenes) {
    if (entry.source !== "render" || entry.request === undefined) {
      scenes.push(stripRequest(entry));
      continue;
    }

    const outcome = await renderSceneSlide(
      { renderer: deps.renderer, cache: deps.cache },
      entry.request,
      options,
    );

    if (outcome.status === "rendered") {
      scenes.push({
        ...stripRequest(entry),
        source: "cached",
        hash: outcome.hash,
        directory: outcome.directory,
      });
    } else {
      scenes.push({
        ...stripRequest(entry),
        source: "placeholder",
        error: outcome.error,
      });
    }
  }

  return {
    tier: plan.tier,
    version: plan.version,
    storyboardHash: plan.storyboardHash,
    scenes,
  };
}

export type PreviewVersionTracker = {
  current(): number;
  next(): number;
};

/** Monotonic preview versions. Each preview is labelled with the next number. */
export function createPreviewVersionTracker(start = 0): PreviewVersionTracker {
  let version = start;

  return {
    current: () => version,
    next: () => {
      version += 1;
      return version;
    },
  };
}
