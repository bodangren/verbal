import { describe, expect, it } from "vitest";
import { hashScene } from "./hash";
import { applyPatch, invertPatch } from "./patches";
import { serializeStoryboard } from "./parse";
import { STORYBOARD_SCHEMA_VERSION, type Scene, type StoryboardDocument } from "./types";

function scene(id: string, overrides: Partial<Scene> = {}): Scene {
  return {
    id,
    anchor: { startWordId: "w0", endWordId: "w1" },
    visual: "slide",
    layer: "speaker-inset",
    template: "bullets",
    ...overrides,
  };
}

function document(): StoryboardDocument {
  return {
    schemaVersion: STORYBOARD_SCHEMA_VERSION,
    scenes: [scene("a"), scene("b"), scene("c")],
  };
}

describe("patches", () => {
  it("adds a scene at an index and inverts back", () => {
    const before = document();
    const patch = { type: "add" as const, scene: scene("d"), index: 1 };

    const after = applyPatch(before, patch);
    expect(after.scenes.map((entry) => entry.id)).toEqual(["a", "d", "b", "c"]);

    const restored = applyPatch(after, invertPatch(before, patch));
    expect(serializeStoryboard(restored)).toBe(serializeStoryboard(before));
  });

  it("removes a scene and inverts back", () => {
    const before = document();
    const patch = { type: "remove" as const, sceneId: "b" };

    const after = applyPatch(before, patch);
    expect(after.scenes.map((entry) => entry.id)).toEqual(["a", "c"]);

    expect(serializeStoryboard(applyPatch(after, invertPatch(before, patch)))).toBe(
      serializeStoryboard(before),
    );
  });

  it("moves a scene and inverts back", () => {
    const before = document();
    const patch = { type: "move" as const, sceneId: "a", toIndex: 2 };

    const after = applyPatch(before, patch);
    expect(after.scenes.map((entry) => entry.id)).toEqual(["b", "c", "a"]);

    expect(serializeStoryboard(applyPatch(after, invertPatch(before, patch)))).toBe(
      serializeStoryboard(before),
    );
  });

  it("replaces an asset and inverts back", () => {
    const before = document();
    const patch = { type: "replace-asset" as const, sceneId: "a", assetId: "asset-2" };

    const after = applyPatch(before, patch);
    expect(after.scenes[0]?.assetId).toBe("asset-2");

    expect(serializeStoryboard(applyPatch(after, invertPatch(before, patch)))).toBe(
      serializeStoryboard(before),
    );
  });

  it("clears an asset with a null patch", () => {
    const before = {
      ...document(),
      scenes: [scene("a", { assetId: "asset-1" })],
    };
    const patch = { type: "replace-asset" as const, sceneId: "a", assetId: null };

    expect(applyPatch(before, patch).scenes[0]?.assetId).toBeUndefined();
  });

  it("updates props and inverts back", () => {
    const before = document();
    const patch = {
      type: "update-props" as const,
      sceneId: "b",
      props: { title: "New", count: 2 },
    };

    const after = applyPatch(before, patch);
    expect(after.scenes[1]?.props).toEqual({ title: "New", count: 2 });

    expect(serializeStoryboard(applyPatch(after, invertPatch(before, patch)))).toBe(
      serializeStoryboard(before),
    );
  });

  it("rejects a patch for an unknown scene", () => {
    expect(() => applyPatch(document(), { type: "remove", sceneId: "zzz" })).toThrow(
      /unknown scene/i,
    );
  });

  it("rejects an out-of-range add index", () => {
    expect(() =>
      applyPatch(document(), { type: "add", scene: scene("d"), index: 9 }),
    ).toThrow(/index/i);
  });
});

describe("hashScene", () => {
  it("is independent of the scene id", () => {
    expect(hashScene(scene("a"))).toBe(hashScene(scene("b")));
  });

  it("is independent of key order in props", () => {
    const first = scene("a", { props: { title: "x", count: 1 } });
    const second = scene("a", { props: { count: 1, title: "x" } });

    expect(hashScene(first)).toBe(hashScene(second));
  });

  it("changes when content changes", () => {
    expect(hashScene(scene("a"))).not.toBe(hashScene(scene("a", { template: "quote" })));
  });

  it("changes when the resolved duration changes", () => {
    expect(hashScene(scene("a"), 3)).not.toBe(hashScene(scene("a"), 4));
  });

  it("returns a stable hexadecimal digest", () => {
    expect(hashScene(scene("a"))).toMatch(/^[0-9a-f]{64}$/);
  });
});
