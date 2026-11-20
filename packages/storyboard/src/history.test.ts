import { describe, expect, it } from "vitest";
import { createStoryboardHistory } from "./history";
import {
  STORYBOARD_SCHEMA_VERSION,
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

function documentOf(id: string): StoryboardDocument {
  return { schemaVersion: STORYBOARD_SCHEMA_VERSION, scenes: [scene(id)] };
}

describe("createStoryboardHistory", () => {
  it("starts at version 1", () => {
    const history = createStoryboardHistory(documentOf("a"));

    expect(history.current()).toEqual({ version: 1, document: documentOf("a") });
  });

  it("appends a new version on commit", () => {
    const history = createStoryboardHistory(documentOf("a"));

    const version = history.commit(documentOf("b"));

    expect(version.version).toBe(2);
    expect(history.versions().map((entry) => entry.version)).toEqual([1, 2]);
    expect(history.current().document).toEqual(documentOf("b"));
  });

  it("reverts by appending the old document as a new version", () => {
    const history = createStoryboardHistory(documentOf("a"));
    history.commit(documentOf("b"));

    const reverted = history.revertTo(1);

    expect(reverted.version).toBe(3);
    expect(reverted.document).toEqual(documentOf("a"));
    expect(history.versions().map((entry) => entry.version)).toEqual([1, 2, 3]);
  });

  it("keeps earlier versions intact", () => {
    const history = createStoryboardHistory(documentOf("a"));
    history.commit(documentOf("b"));

    expect(history.versions()[0]).toEqual({ version: 1, document: documentOf("a") });
  });

  it("rejects an unknown version", () => {
    const history = createStoryboardHistory(documentOf("a"));
    let code: string | undefined;

    try {
      history.revertTo(99);
    } catch (error) {
      code = (error as { code?: string }).code;
    }

    expect(code).toBe("unknown-version");
  });

  it("returns a copy of the version list", () => {
    const history = createStoryboardHistory(documentOf("a"));
    const versions = history.versions();

    versions.push({ version: 99, document: documentOf("z") });

    expect(history.versions()).toHaveLength(1);
  });
});
