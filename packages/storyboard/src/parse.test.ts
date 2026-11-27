import { describe, expect, it } from "vitest";
import { STORYBOARD_SCHEMA_VERSION, StoryboardError, type Scene } from "./types";
import { parseStoryboard, serializeStoryboard } from "./parse";

function scene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "s1",
    anchor: { startWordId: "w0", endWordId: "w2" },
    visual: "slide",
    layer: "full-frame",
    template: "title",
    ...overrides,
  };
}

function documentOf(scenes: Scene[]): unknown {
  return { schemaVersion: STORYBOARD_SCHEMA_VERSION, scenes };
}

describe("parseStoryboard", () => {
  it("parses a valid document", () => {
    const parsed = parseStoryboard(JSON.stringify(documentOf([scene()])));

    expect(parsed.scenes).toHaveLength(1);
    expect(parsed.scenes[0]).toEqual(scene());
  });

  it("round-trips through serialisation", () => {
    const parsed = parseStoryboard(JSON.stringify(documentOf([scene(), scene({ id: "s2" })])));

    expect(parseStoryboard(serializeStoryboard(parsed))).toEqual(parsed);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseStoryboard("{nope")).toThrow(StoryboardError);
  });

  it("rejects a newer schema version", () => {
    const raw = JSON.stringify({
      schemaVersion: STORYBOARD_SCHEMA_VERSION + 1,
      scenes: [scene()],
    });

    expect(() => parseStoryboard(raw)).toThrow(/newer/i);
  });

  it("rejects duplicate scene ids", () => {
    const raw = JSON.stringify(documentOf([scene(), scene()]));

    expect(() => parseStoryboard(raw)).toThrow(/duplicate/i);
  });

  it("rejects a scene id in the reserved internal prefix", () => {
    const raw = JSON.stringify(documentOf([scene({ id: "__talk-piece-1" })]));

    expect(() => parseStoryboard(raw)).toThrow(/__talk-piece-1/);
  });

  it("rejects an unknown visual kind", () => {
    const raw = JSON.stringify(documentOf([scene({ visual: "hologram" as never })]));

    expect(() => parseStoryboard(raw)).toThrow(StoryboardError);
  });

  it("rejects an incomplete anchor", () => {
    const raw = JSON.stringify(
      documentOf([scene({ anchor: { startWordId: "w0" } as never })]),
    );

    expect(() => parseStoryboard(raw)).toThrow(StoryboardError);
  });

  it("requires an asset for a static scene", () => {
    const raw = JSON.stringify(documentOf([scene({ visual: "static", template: undefined })]));

    expect(() => parseStoryboard(raw)).toThrow(/asset/i);
  });

  it("requires a template or asset for a slide", () => {
    const raw = JSON.stringify(
      documentOf([scene({ visual: "slide", template: undefined, assetId: undefined })]),
    );

    expect(() => parseStoryboard(raw)).toThrow(/template|asset/i);
  });

  it("accepts a generated asset id in SHA-256 hex form", () => {
    const assetId = "a".repeat(64);
    const raw = JSON.stringify(
      documentOf([scene({ visual: "generated-image", template: undefined, assetId })]),
    );

    expect(parseStoryboard(raw).scenes[0]?.assetId).toBe(assetId);
  });

  it.each(["../x", "a/b", "asset-1", "A".repeat(64), "a".repeat(63), "g".repeat(64)])(
    "rejects the asset id %s",
    (assetId) => {
      const raw = JSON.stringify(
        documentOf([
          scene({ id: "hero", visual: "generated-image", template: undefined, assetId }),
        ]),
      );

      expect(() => parseStoryboard(raw)).toThrow(/scene hero: assetId/);
    },
  );

  it("allows a talk scene without a template", () => {
    const raw = JSON.stringify(
      documentOf([scene({ visual: "talk", template: undefined })]),
    );

    expect(parseStoryboard(raw).scenes[0]?.visual).toBe("talk");
  });
});
