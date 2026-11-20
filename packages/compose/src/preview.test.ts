import { describe, expect, it, vi } from "vitest";
import { createTranscript } from "@verbal/core";
import {
  anchorIndexFromTranscript,
  type Scene,
  type StoryboardDocument,
} from "@verbal/storyboard";
import { createMemorySlideCache } from "./cache";
import {
  createPreviewVersionTracker,
  executePreviewPlan,
  planPreview,
  storyboardContentHash,
} from "./preview";
import { slideRequestHash } from "./slides";
import type { SlideManifest, SlideRenderer } from "./types";

const transcript = createTranscript([
  { text: "a", start: 0, end: 0.5 },
  { text: "b", start: 0.5, end: 1 },
  { text: "c", start: 1.5, end: 2 },
]);

const anchors = anchorIndexFromTranscript(transcript);
const geometry = { fps: 30, width: 1920, height: 1080 };

const MANIFEST: SlideManifest = {
  frames: 30,
  fps: 30,
  width: 1920,
  height: 1080,
  hasAlpha: true,
  pattern: "element-%04d.png",
};

function scene(id: string, overrides: Partial<Scene> = {}): Scene {
  return {
    id,
    anchor: { startWordId: "w0", endWordId: "w1" },
    visual: "slide",
    layer: "full-frame",
    template: "title",
    props: { title: id },
    ...overrides,
  };
}

function documentOf(...scenes: Scene[]): StoryboardDocument {
  return { schemaVersion: 1, scenes };
}

function input(tier: "fast" | "full", cache = createMemorySlideCache("/cache"), version = 1) {
  return { storyboard: documentOf(scene("s1")), anchors, cache, tier, version, geometry };
}

function requestFor(id: string) {
  return {
    sceneId: id,
    template: "title",
    props: { title: id },
    durationSeconds: 1,
    ...geometry,
  };
}

describe("storyboardContentHash", () => {
  it("is stable for identical documents", () => {
    expect(storyboardContentHash(documentOf(scene("s1")))).toBe(
      storyboardContentHash(documentOf(scene("s1"))),
    );
  });

  it("changes when the document changes", () => {
    expect(storyboardContentHash(documentOf(scene("s1")))).not.toBe(
      storyboardContentHash(documentOf(scene("s2"))),
    );
  });
});

describe("planPreview", () => {
  it("uses placeholders for uncached slides on the fast tier", async () => {
    const plan = await planPreview(input("fast"));

    expect(plan.scenes).toHaveLength(1);
    expect(plan.scenes[0]?.source).toBe("placeholder");
    expect(plan.scenes.some((entry) => entry.source === "render")).toBe(false);
  });

  it("plans renders for uncached slides on the full tier", async () => {
    const plan = await planPreview(input("full"));

    expect(plan.scenes[0]?.source).toBe("render");
  });

  it("uses cached frames on both tiers when they exist", async () => {
    const cache = createMemorySlideCache("/cache");
    await cache.writeManifest(slideRequestHash(requestFor("s1")), MANIFEST);

    expect((await planPreview(input("fast", cache))).scenes[0]?.source).toBe("cached");
    expect((await planPreview(input("full", cache))).scenes[0]?.source).toBe("cached");
  });

  it("resolves scene times from the anchor index", async () => {
    const plan = await planPreview(input("fast"));

    expect(plan.scenes[0]).toMatchObject({ startSeconds: 0, endSeconds: 1 });
  });

  it("labels talk and static scenes without planning a render", async () => {
    const storyboard = documentOf(
      scene("talk", { visual: "talk", template: undefined }),
      scene("still", { visual: "static", template: undefined, assetId: "asset-1" }),
    );

    const plan = await planPreview({
      storyboard,
      anchors,
      cache: createMemorySlideCache("/cache"),
      tier: "full",
      version: 1,
      geometry,
    });

    expect(plan.scenes.map((entry) => entry.source)).toEqual(["talk", "asset"]);
  });

  it("marks pending generated scenes as placeholders", async () => {
    const storyboard = documentOf(
      scene("g1", { visual: "generated-image", template: undefined }),
      scene("g2", { visual: "generated-video", template: undefined }),
    );

    const plan = await planPreview({
      ...input("full"),
      storyboard,
    });

    expect(plan.scenes.map((entry) => entry.source)).toEqual(["placeholder", "placeholder"]);
  });

  it("uses the asset when a generated scene has one", async () => {
    const storyboard = documentOf(
      scene("g1", { visual: "generated-image", template: undefined, assetId: "asset-1" }),
      scene("g2", { visual: "generated-video", template: undefined, assetId: "asset-2" }),
    );

    const plan = await planPreview({ ...input("fast"), storyboard });

    expect(plan.scenes.map((entry) => entry.source)).toEqual(["asset", "asset"]);
  });

  it("derives both tiers from the same storyboard hash and order", async () => {
    const cache = createMemorySlideCache("/cache");
    const fast = await planPreview({
      ...input("fast", cache),
      storyboard: documentOf(scene("s1"), scene("s2")),
    });
    const full = await planPreview({
      ...input("full", cache),
      storyboard: documentOf(scene("s1"), scene("s2")),
    });

    expect(fast.storyboardHash).toBe(full.storyboardHash);
    expect(fast.scenes.map((entry) => entry.sceneId)).toEqual(
      full.scenes.map((entry) => entry.sceneId),
    );
  });

  it("preserves the requested version", async () => {
    expect((await planPreview(input("fast", undefined, 7))).version).toBe(7);
  });
});

describe("executePreviewPlan", () => {
  it("never calls the renderer for a fast plan", async () => {
    const renderer: SlideRenderer = { render: vi.fn() };
    const plan = await planPreview(input("fast"));

    const executed = await executePreviewPlan(
      { renderer, cache: createMemorySlideCache("/cache") },
      plan,
    );

    expect(renderer.render).not.toHaveBeenCalled();
    expect(executed.scenes[0]?.source).toBe("placeholder");
  });

  it("renders uncached slides for a full plan", async () => {
    const renderer: SlideRenderer = {
      render: vi.fn(async () => MANIFEST),
    };
    const cache = createMemorySlideCache("/cache");
    const plan = await planPreview(input("full", cache));

    const executed = await executePreviewPlan({ renderer, cache }, plan);

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(executed.scenes[0]?.source).toBe("cached");
    expect(await cache.has(plan.scenes[0]?.hash ?? "")).toBe(true);
  });

  it("does not render cached slides again", async () => {
    const cache = createMemorySlideCache("/cache");
    await cache.writeManifest(slideRequestHash(requestFor("s1")), MANIFEST);
    const renderer: SlideRenderer = { render: vi.fn() };
    const plan = await planPreview(input("full", cache));

    await executePreviewPlan({ renderer, cache }, plan);

    expect(renderer.render).not.toHaveBeenCalled();
  });
});

describe("createPreviewVersionTracker", () => {
  it("increments monotonically", () => {
    const tracker = createPreviewVersionTracker();

    expect(tracker.current()).toBe(0);
    expect(tracker.next()).toBe(1);
    expect(tracker.next()).toBe(2);
    expect(tracker.current()).toBe(2);
  });

  it("can start from an existing version", () => {
    expect(createPreviewVersionTracker(41).next()).toBe(42);
  });
});
