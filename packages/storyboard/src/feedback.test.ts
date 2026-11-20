import { describe, expect, it } from "vitest";
import {
  applyAcceptedPatches,
  applyPatches,
  describePatch,
  parsePatchResponse,
} from "./feedback";
import {
  STORYBOARD_SCHEMA_VERSION,
  StoryboardError,
  type Scene,
  type StoryboardDocument,
} from "./types";

function scene(id: string): Scene {
  return {
    id,
    anchor: { startWordId: "w0", endWordId: "w1" },
    visual: "talk",
    layer: "full-frame",
  };
}

const document: StoryboardDocument = {
  schemaVersion: STORYBOARD_SCHEMA_VERSION,
  scenes: [scene("a"), scene("b")],
};

describe("parsePatchResponse", () => {
  it("parses a valid patch list", () => {
    const raw = JSON.stringify({
      patches: [
        { type: "remove", sceneId: "b" },
        { type: "move", sceneId: "a", toIndex: 0 },
      ],
    });

    expect(parsePatchResponse(raw)).toEqual([
      { type: "remove", sceneId: "b" },
      { type: "move", sceneId: "a", toIndex: 0 },
    ]);
  });

  it("rejects invalid JSON", () => {
    expect(() => parsePatchResponse("{nope")).toThrow(StoryboardError);
  });

  it("rejects a response without a patches array", () => {
    expect(() => parsePatchResponse(JSON.stringify({ edits: [] }))).toThrow(/patches/i);
  });

  it("rejects an unknown patch type", () => {
    const raw = JSON.stringify({ patches: [{ type: "rewrite-everything" }] });

    expect(() => parsePatchResponse(raw)).toThrow(/unknown patch type/i);
  });

  it("rejects an add without a scene", () => {
    const raw = JSON.stringify({ patches: [{ type: "add", index: 0 }] });

    expect(() => parsePatchResponse(raw)).toThrow(StoryboardError);
  });

  it("rejects a non-integer index", () => {
    const raw = JSON.stringify({
      patches: [{ type: "add", scene: scene("c"), index: 1.5 }],
    });

    expect(() => parsePatchResponse(raw)).toThrow(StoryboardError);
  });

  it("accepts a null asset for replace-asset", () => {
    const raw = JSON.stringify({
      patches: [{ type: "replace-asset", sceneId: "a", assetId: null }],
    });

    expect(parsePatchResponse(raw)).toEqual([
      { type: "replace-asset", sceneId: "a", assetId: null },
    ]);
  });
});

describe("applyPatches", () => {
  it("applies patches in order", () => {
    const after = applyPatches(document, [
      { type: "remove", sceneId: "b" },
      { type: "add", scene: scene("c"), index: 1 },
    ]);

    expect(after.scenes.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("rejects a patch that targets a missing scene", () => {
    expect(() => applyPatches(document, [{ type: "remove", sceneId: "zzz" }])).toThrow(
      /unknown scene/i,
    );
  });
});

describe("applyAcceptedPatches", () => {
  it("applies only the accepted hunks", () => {
    const patches = [
      { type: "remove" as const, sceneId: "b" },
      { type: "move" as const, sceneId: "a", toIndex: 0 },
    ];

    const after = applyAcceptedPatches(document, patches, [true, false]);

    expect(after.scenes.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("returns the document unchanged when nothing is accepted", () => {
    const patches = [{ type: "remove" as const, sceneId: "b" }];

    expect(applyAcceptedPatches(document, patches, [false]).scenes).toHaveLength(2);
  });
});

describe("describePatch", () => {
  it("describes each patch type", () => {
    expect(describePatch({ type: "remove", sceneId: "b" })).toBe("Remove scene b");
    expect(describePatch({ type: "add", scene: scene("c"), index: 1 })).toContain(
      "Add scene c",
    );
    expect(describePatch({ type: "move", sceneId: "a", toIndex: 2 })).toContain("Move scene a");
    expect(
      describePatch({ type: "replace-asset", sceneId: "a", assetId: "asset-2" }),
    ).toContain("asset-2");
    expect(describePatch({ type: "replace-asset", sceneId: "a", assetId: null })).toMatch(
      /clear/i,
    );
    expect(describePatch({ type: "update-props", sceneId: "a", props: {} })).toContain("props");
  });
});
