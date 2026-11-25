import { describe, expect, it } from "vitest";
import {
  createTranscript,
  insertSilence,
  moveRange,
  removeRange,
  splitSegment,
  TranscriptError,
  type TranscriptDocument,
} from "./transcript";

/** Words at 0, 0.45 and 1.8: two segments, because of the 1.35s gap. */
function fixture(): TranscriptDocument {
  return createTranscript([
    { text: "keep", start: 0, end: 0.4 },
    { text: "this", start: 0.45, end: 0.9 },
    { text: "later", start: 1.8, end: 2.2 },
  ]);
}

function timings(transcript: TranscriptDocument): [number, number][] {
  return transcript.words.map((word) => [word.start, word.end]);
}

describe("insertSilence", () => {
  it("leaves every word time in source seconds and records the air", () => {
    const edited = insertSilence(fixture(), "w0", 1);

    expect(timings(edited)).toEqual(timings(fixture()));
    expect(edited.silences).toEqual([{ afterWordId: "w0", seconds: 1 }]);
  });

  it("keeps ids and segment structure", () => {
    const edited = insertSilence(fixture(), "w0", 1);

    expect(edited.words.map((word) => word.id)).toEqual(["w0", "w1", "w2"]);
    expect(edited.segments).toEqual(fixture().segments);
  });

  it("accumulates when applied twice", () => {
    const once = insertSilence(fixture(), "w0", 0.5);
    const twice = insertSilence(once, "w0", 0.5);

    expect(twice.silences).toEqual([{ afterWordId: "w0", seconds: 1 }]);
    expect(timings(twice)).toEqual(timings(fixture()));
  });

  it("treats zero or negative seconds as no change", () => {
    const transcript = fixture();

    expect(insertSilence(transcript, "w0", 0)).toBe(transcript);
    expect(insertSilence(transcript, "w0", -2)).toBe(transcript);
    expect(insertSilence(transcript, "w0", Number.NaN)).toBe(transcript);
  });

  it("rejects an unknown anchor word", () => {
    expect(() => insertSilence(fixture(), "w9", 1)).toThrow(TranscriptError);
  });

  it("keeps the entry when its word is removed", () => {
    const edited = removeRange(insertSilence(fixture(), "w1", 1.5), 1, 1);

    expect(edited.silences).toEqual([{ afterWordId: "w1", seconds: 1.5 }]);
    expect(timings(edited)).toEqual(timings(fixture()));
  });

  it("keeps the entry attached to its word after a move", () => {
    const edited = moveRange(insertSilence(fixture(), "w1", 1.5), 1, 1, 2);

    expect(edited.words.map((word) => word.id)).toEqual(["w0", "w2", "w1"]);
    expect(edited.silences).toEqual([{ afterWordId: "w1", seconds: 1.5 }]);
  });
});

describe("splitSegment", () => {
  function singleSegment(): TranscriptDocument {
    return createTranscript([
      { text: "one", start: 0, end: 0.3 },
      { text: "two", start: 0.35, end: 0.6 },
      { text: "three", start: 0.65, end: 0.9 },
      { text: "four", start: 0.95, end: 1.2 },
    ]);
  }

  it("starts a new segment at the chosen word", () => {
    const edited = splitSegment(singleSegment(), "w2");

    expect(edited.segments.map((segment) => segment.wordIds)).toEqual([
      ["w0", "w1"],
      ["w2", "w3"],
    ]);
  });

  it("leaves the words and their order untouched", () => {
    const edited = splitSegment(singleSegment(), "w2");

    expect(edited.words).toEqual(singleSegment().words);
  });

  it("is a no-op at the head of a segment", () => {
    const transcript = singleSegment();

    expect(splitSegment(transcript, "w0")).toBe(transcript);
  });

  it("is a no-op at the head of a later segment", () => {
    const transcript = splitSegment(singleSegment(), "w2");

    expect(splitSegment(transcript, "w2")).toBe(transcript);
  });

  it("gives every new segment a unique id", () => {
    const first = splitSegment(singleSegment(), "w2");
    const second = splitSegment(first, "w1");
    const ids = second.segments.map((segment) => segment.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(3);
  });

  it("rejects an unknown word", () => {
    expect(() => splitSegment(singleSegment(), "w9")).toThrow(TranscriptError);
  });
});
