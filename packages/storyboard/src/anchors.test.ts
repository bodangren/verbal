import { describe, expect, it } from "vitest";
import { createTranscript } from "@verbal/core";
import { anchorIndexFromTranscript, resolveScene } from "./anchors";
import type { Scene } from "./types";

const transcript = createTranscript([
  { text: "hello", start: 0, end: 0.4 },
  { text: "world", start: 0.45, end: 0.9 },
  { text: "again", start: 1.8, end: 2.2 },
]);

const index = anchorIndexFromTranscript(transcript);

function scene(startWordId: string, endWordId: string): Scene {
  return {
    id: "s1",
    anchor: { startWordId, endWordId },
    visual: "talk",
    layer: "full-frame",
  };
}

describe("anchorIndexFromTranscript", () => {
  it("copies ids and timestamps in order", () => {
    expect(index.words).toEqual([
      { id: "w0", start: 0, end: 0.4 },
      { id: "w1", start: 0.45, end: 0.9 },
      { id: "w2", start: 1.8, end: 2.2 },
    ]);
  });
});

describe("resolveScene", () => {
  it("resolves a word span to a time range", () => {
    const resolved = resolveScene(scene("w0", "w2"), index);

    expect(resolved).toEqual({ startSeconds: 0, endSeconds: 2.2 });
  });

  it("resolves a single-word span", () => {
    expect(resolveScene(scene("w1", "w1"), index)).toEqual({
      startSeconds: 0.45,
      endSeconds: 0.9,
    });
  });

  it("rejects an unknown start word", () => {
    expect(() => resolveScene(scene("w9", "w2"), index)).toThrow(/unknown anchor/i);
  });

  it("rejects an unknown end word", () => {
    expect(() => resolveScene(scene("w0", "w9"), index)).toThrow(/unknown anchor/i);
  });

  it("rejects a reversed span", () => {
    expect(() => resolveScene(scene("w2", "w0"), index)).toThrow(/reversed/i);
  });
});
