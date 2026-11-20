import type { StoryboardDocument } from "@verbal/storyboard";
import type { AssetRecord } from "./assets";

/** How long an unreferenced asset is kept before it becomes prunable. */
export const DEFAULT_MIN_AGE_SECONDS = 24 * 60 * 60;

export type PrunePlan = {
  /** Referenced assets and user uploads: never deleted. */
  keep: string[];
  /** Unreferenced but too young to delete yet. */
  retained: string[];
  /** Unreferenced and past the age threshold. */
  prune: string[];
};

export type PlanAssetPruneInput = {
  storyboard: StoryboardDocument;
  assets: readonly AssetRecord[];
  now: Date;
  minAgeSeconds?: number;
};

/** Every asset id any scene points at, current or stale. */
function referencedIds(storyboard: StoryboardDocument): Set<string> {
  const ids = new Set<string>();

  for (const scene of storyboard.scenes) {
    if (scene.assetId !== undefined) {
      ids.add(scene.assetId);
    }
  }

  return ids;
}

/**
 * Plans which stored assets survive.
 *
 * Nothing here deletes: the plan is the report a user confirms. Referenced
 * assets and user uploads are always kept, and an unreferenced generated asset
 * is kept until it is older than the threshold, so a draft storyboard that has
 * not been saved yet cannot lose its assets.
 */
export function planAssetPrune({
  storyboard,
  assets,
  now,
  minAgeSeconds = DEFAULT_MIN_AGE_SECONDS,
}: PlanAssetPruneInput): PrunePlan {
  const referenced = referencedIds(storyboard);
  const plan: PrunePlan = { keep: [], retained: [], prune: [] };

  for (const asset of assets) {
    if (referenced.has(asset.id) || asset.source === "user") {
      plan.keep.push(asset.id);
      continue;
    }

    const created = Date.parse(asset.createdAt);
    const ageSeconds = (now.getTime() - created) / 1000;

    // An unreadable timestamp is treated as young: a corrupt record must not
    // become a reason to delete a file.
    if (!Number.isFinite(ageSeconds) || ageSeconds < minAgeSeconds) {
      plan.retained.push(asset.id);
      continue;
    }

    plan.prune.push(asset.id);
  }

  return plan;
}
