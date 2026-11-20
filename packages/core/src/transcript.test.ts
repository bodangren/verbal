import { describe, expect, it } from "vitest";
import {
  TRANSCRIPT_SCHEMA_VERSION,
  TranscriptError,
  createTranscript,
  groupSegments,
  keptWords,
  parseTranscript,
  removeRange,
  removeWord,
  serializeTranscript,
} from "./transcript";

const SPOKEN = [
  { text: "hello", start: 0, end: 0.4 },
  { text: "world", start: 0.45, end: 0.9 },
  { text: "again", start: 1.8, end: 2.2 },
  { text: "now", start: 2.25, end: 2.6 },
];

describe("createTranscript", () => {
  it("assigns sequential stable ids", () => {
    const transcript = createTranscript(SPOKEN);

    expect(transcript.words.map((word) => word.id)).toEqual(["w0", "w1", "w2", "w3"]);
    expect(transcript.schemaVersion).toBe(TRANSCRIPT_SCHEMA_VERSION);
    expect(transcript.removedWordIds).toEqual([]);
  });

  it("groups words into segments at a silence gap", () => {
    const transcript = createTranscript(SPOKEN);

    expect(transcript.segments).toEqual([
      { id: "s0", wordIds: ["w0", "w1"] },
      { id: "s1", wordIds: ["w2", "w3"] },
    ]);
  });

  it("keeps one segment when the words are continuous", () => {
    const transcript = createTranscript([
      { text: "a", start: 0, end: 0.2 },
      { text: "b", start: 0.21, end: 0.4 },
    ]);

    expect(transcript.segments).toEqual([{ id: "s0", wordIds: ["w0", "w1"] }]);
  });

  it("rejects a word whose end precedes its start", () => {
    expect(() => createTranscript([{ text: "bad", start: 1, end: 0.5 }])).toThrow(TranscriptError);
  });

  it("rejects an empty transcript", () => {
    expect(() => createTranscript([])).toThrow(/empty/i);
  });
});

describe("groupSegments", () => {
  it("splits when the gap exceeds the threshold", () => {
    const words = [
      { id: "w0", text: "a", start: 0, end: 0.5 },
      { id: "w1", text: "b", start: 1.4, end: 1.8 },
    ];

    expect(groupSegments(words, 0.75)).toEqual([
      { id: "s0", wordIds: ["w0"] },
      { id: "s1", wordIds: ["w1"] },
    ]);
  });
});

describe("removeWord", () => {
  it("marks a word as removed without mutating the original", () => {
    const transcript = createTranscript(SPOKEN);
    const edited = removeWord(transcript, "w1");

    expect(edited.removedWordIds).toEqual(["w1"]);
    expect(transcript.removedWordIds).toEqual([]);
  });

  it("is idempotent", () => {
    const transcript = removeWord(createTranscript(SPOKEN), "w1");

    expect(removeWord(transcript, "w1")).toBe(transcript);
  });

  it("rejects an unknown word id", () => {
    expect(() => removeWord(createTranscript(SPOKEN), "w99")).toThrow(/unknown word/i);
  });
});

describe("removeRange", () => {
  it("marks every word in an inclusive range", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 1, 2);

    expect(transcript.removedWordIds).toEqual(["w1", "w2"]);
  });

  it("keeps removal ids in word order", () => {
    const once = removeWord(createTranscript(SPOKEN), "w2");
    const both = removeRange(once, 0, 0);

    expect(both.removedWordIds).toEqual(["w0", "w2"]);
  });

  it("rejects an out-of-range selection", () => {
    expect(() => removeRange(createTranscript(SPOKEN), 2, 1)).toThrow(TranscriptError);
    expect(() => removeRange(createTranscript(SPOKEN), 0, 4)).toThrow(TranscriptError);
  });
});

describe("keptWords", () => {
  it("returns only words that were not removed", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 1, 2);

    expect(keptWords(transcript).map((word) => word.text)).toEqual(["hello", "now"]);
  });
});

describe("serialisation", () => {
  it("round-trips through parse", () => {
    const transcript = removeWord(createTranscript(SPOKEN), "w2");

    expect(parseTranscript(serializeTranscript(transcript))).toEqual(transcript);
  });

  it("rejects a newer schema version", () => {
    const raw = JSON.stringify({
      ...createTranscript(SPOKEN),
      schemaVersion: TRANSCRIPT_SCHEMA_VERSION + 1,
    });

    expect(() => parseTranscript(raw)).toThrow(/newer/i);
  });

  it("rejects removed ids that do not exist", () => {
    const raw = JSON.stringify({
      ...createTranscript(SPOKEN),
      removedWordIds: ["w42"],
    });

    expect(() => parseTranscript(raw)).toThrow(/unknown word/i);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseTranscript("{nope")).toThrow(TranscriptError);
  });
});
