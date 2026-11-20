import { describe, expect, it } from "vitest";
import type { StoryboardDocument } from "@verbal/storyboard";
import type { AssetRecord } from "./assets";
import { planAssetPrune } from "./prune";

const NOW = new Date("2026-11-21T12:00:00.000Z");

function asset(overrides: Partial<AssetRecord> & { id: string }): AssetRecord {
  return {
    mediaType: "image/png",
    source: "generated",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function storyboard(assetIds: readonly string[]): StoryboardDocument {
  return {
    schemaVersion: 1,
    scenes: assetIds.map((assetId, index) => ({
      id: `s${index + 1}`,
      anchor: { startWordId: "w0", endWordId: "w0" },
      visual: "generated-image" as const,
      layer: "full-frame" as const,
      assetId,
    })),
  } as StoryboardDocument;
}

describe("planAssetPrune", () => {
  it("keeps referenced assets, never prunes user assets, and prunes old unreferenced generations", () => {
    const assets = [
      asset({ id: "referenced" }),
      asset({ id: "user-upload", source: "user" }),
      asset({ id: "recent", createdAt: "2026-11-21T11:00:00.000Z" }),
      asset({ id: "old" }),
    ];

    const plan = planAssetPrune({ storyboard: storyboard(["referenced"]), assets, now: NOW });

    expect(plan.keep).toEqual(["referenced", "user-upload"]);
    expect(plan.retained).toEqual(["recent"]);
    expect(plan.prune).toEqual(["old"]);
  });

  it("keeps an asset referenced by any scene", () => {
    const assets = [asset({ id: "a" }), asset({ id: "b" })];

    const plan = planAssetPrune({ storyboard: storyboard(["b"]), assets, now: NOW });

    expect(plan.keep).toEqual(["b"]);
    expect(plan.prune).toEqual(["a"]);
  });

  it("keeps a storyboard with no assets from pruning anything referenced-less but young", () => {
    const assets = [asset({ id: "fresh", createdAt: "2026-11-21T11:59:00.000Z" })];

    const plan = planAssetPrune({ storyboard: storyboard([]), assets, now: NOW });

    expect(plan.prune).toEqual([]);
    expect(plan.retained).toEqual(["fresh"]);
  });

  it("treats an asset exactly at the threshold as prunable", () => {
    const assets = [asset({ id: "edge", createdAt: "2026-11-20T12:00:00.000Z" })];

    const plan = planAssetPrune({ storyboard: storyboard([]), assets, now: NOW });

    expect(plan.prune).toEqual(["edge"]);
  });

  it("honours a custom threshold", () => {
    const assets = [asset({ id: "two-hours", createdAt: "2026-11-21T10:00:00.000Z" })];

    expect(
      planAssetPrune({ storyboard: storyboard([]), assets, now: NOW, minAgeSeconds: 3600 }).prune,
    ).toEqual(["two-hours"]);
    expect(
      planAssetPrune({ storyboard: storyboard([]), assets, now: NOW, minAgeSeconds: 86400 }).prune,
    ).toEqual([]);
  });

  it("preserves the input order within each list", () => {
    const assets = [
      asset({ id: "old-1" }),
      asset({ id: "user-1", source: "user" }),
      asset({ id: "old-2" }),
      asset({ id: "ref-1" }),
    ];

    const plan = planAssetPrune({
      storyboard: storyboard(["ref-1"]),
      assets,
      now: NOW,
    });

    expect(plan.prune).toEqual(["old-1", "old-2"]);
    expect(plan.keep).toEqual(["user-1", "ref-1"]);
  });

  it("reports nothing for a project with no assets", () => {
    expect(
      planAssetPrune({ storyboard: storyboard([]), assets: [], now: NOW }),
    ).toEqual({ keep: [], retained: [], prune: [] });
  });

  it("does not prune an asset with an unparseable creation date", () => {
    const assets = [asset({ id: "broken", createdAt: "not a date" })];

    const plan = planAssetPrune({ storyboard: storyboard([]), assets, now: NOW });

    expect(plan.prune).toEqual([]);
    expect(plan.retained).toEqual(["broken"]);
  });
});
