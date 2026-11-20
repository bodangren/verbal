import { describe, expect, it } from "vitest";
import {
  createTranscript,
  moveRange,
  TranscriptError,
  type TranscriptDocument,
} from "./transcript";

function texts(transcript: TranscriptDocument): string[] {
  return transcript.words.map((word) => word.text);
}

/** Four words in one segment: gaps are all below the 0.75s split threshold. */
function oneSegment(): TranscriptDocument {
  return createTranscript([
    { text: "a", start: 0, end: 0.2 },
    { text: "b", start: 0.25, end: 0.45 },
    { text: "c", start: 0.5, end: 0.7 },
    { text: "d", start: 0.75, end: 0.95 },
  ]);
}

/** Two segments: "a b" then "c d", split by a 1.5s silence. */
function twoSegments(): TranscriptDocument {
  return createTranscript([
    { text: "a", start: 0, end: 0.2 },
    { text: "b", start: 0.25, end: 0.45 },
    { text: "c", start: 2, end: 2.2 },
    { text: "d", start: 2.25, end: 2.45 },
  ]);
}

function segmentTexts(transcript: TranscriptDocument): string[][] {
  return transcript.segments.map((segment) =>
    segment.wordIds.map((id) => transcript.words.find((word) => word.id === id)?.text ?? "?"),
  );
}

describe("moveRange", () => {
  it("moves a word later", () => {
    const moved = moveRange(oneSegment(), 0, 0, 2);

    expect(texts(moved)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a word earlier", () => {
    const moved = moveRange(oneSegment(), 3, 3, 0);

    expect(texts(moved)).toEqual(["d", "a", "b", "c"]);
  });

  it("moves a block and keeps its internal order", () => {
    const moved = moveRange(oneSegment(), 0, 1, 2);

    expect(texts(moved)).toEqual(["c", "d", "a", "b"]);
  });

  it("clamps a target past the end", () => {
    const moved = moveRange(oneSegment(), 0, 0, 99);

    expect(texts(moved)).toEqual(["b", "c", "d", "a"]);
  });

  it("clamps a negative target to the front", () => {
    const moved = moveRange(oneSegment(), 2, 2, -5);

    expect(texts(moved)).toEqual(["c", "a", "b", "d"]);
  });

  it("is a no-op at the same position", () => {
    const transcript = oneSegment();

    expect(moveRange(transcript, 1, 1, 1)).toBe(transcript);
  });

  it("is a no-op inside the moved block", () => {
    const transcript = oneSegment();

    expect(moveRange(transcript, 1, 2, 2)).toBe(transcript);
    expect(moveRange(transcript, 1, 2, 1)).toBe(transcript);
  });

  it("rejects an invalid range", () => {
    const transcript = oneSegment();

    expect(() => moveRange(transcript, -1, 1, 0)).toThrow(TranscriptError);
    expect(() => moveRange(transcript, 2, 1, 0)).toThrow(TranscriptError);
    expect(() => moveRange(transcript, 0, 9, 0)).toThrow(TranscriptError);
    expect(() => moveRange(transcript, 0.5, 1, 0)).toThrow(TranscriptError);
  });

  it("preserves word ids, texts, and timings", () => {
    const original = oneSegment();
    const moved = moveRange(original, 0, 0, 3);

    for (const word of original.words) {
      expect(moved.words.find((entry) => entry.id === word.id)).toEqual(word);
    }
  });

  it("rewrites segments in the new word order", () => {
    const moved = moveRange(oneSegment(), 0, 0, 2);

    expect(segmentTexts(moved)).toEqual([["b", "c", "a", "d"]]);
    expect(moved.segments).toHaveLength(1);
  });

  it("gives a word moved across a boundary to its new neighbour's segment", () => {
    const moved = moveRange(twoSegments(), 1, 1, 2);

    expect(texts(moved)).toEqual(["a", "c", "b", "d"]);
    expect(segmentTexts(moved)).toEqual([["a"], ["c", "b", "d"]]);
  });

  it("drops a segment left empty by the move", () => {
    const moved = moveRange(twoSegments(), 0, 1, 2);

    expect(segmentTexts(moved)).toEqual([["c", "d", "a", "b"]]);
    expect(moved.segments).toHaveLength(1);
  });
});
