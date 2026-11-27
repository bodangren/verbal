import { describe, expect, it } from "vitest";
import {
  TRANSCRIPT_SCHEMA_VERSION,
  TranscriptError,
  createTranscript,
  groupSegments,
  insertSilence,
  keptWords,
  parseTranscript,
  removeRange,
  removeWord,
  restoreRange,
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

  it("returns the same document when every word is already removed", () => {
    const once = removeRange(createTranscript(SPOKEN), 1, 2);

    expect(removeRange(once, 1, 2)).toBe(once);
  });

  it("rejects an out-of-range selection", () => {
    expect(() => removeRange(createTranscript(SPOKEN), 2, 1)).toThrow(TranscriptError);
    expect(() => removeRange(createTranscript(SPOKEN), 0, 4)).toThrow(TranscriptError);
  });
});

describe("restoreRange", () => {
  it("revives the removed words in an inclusive range", () => {
    const removed = removeRange(createTranscript(SPOKEN), 1, 2);

    const restored = restoreRange(removed, 1, 2);

    expect(restored.removedWordIds).toEqual([]);
    expect(keptWords(restored).map((word) => word.text)).toEqual([
      "hello",
      "world",
      "again",
      "now",
    ]);
    // The removed input is untouched: edits are immutable.
    expect(removed.removedWordIds).toEqual(["w1", "w2"]);
  });

  it("keeps removals outside the range, in word order", () => {
    const removed = removeRange(createTranscript(SPOKEN), 0, 3);

    const restored = restoreRange(removed, 1, 2);

    expect(restored.removedWordIds).toEqual(["w0", "w3"]);
    expect(keptWords(restored).map((word) => word.text)).toEqual(["world", "again"]);
  });

  it("keeps word order, ids, timings, segments and silences", () => {
    const before = insertSilence(createTranscript(SPOKEN), "w1", 1.5);
    const removed = removeRange(before, 1, 3);

    const restored = restoreRange(removed, 1, 3);

    expect(restored.words).toEqual(before.words);
    expect(restored.segments).toEqual(before.segments);
    expect(restored.silences).toEqual([{ afterWordId: "w1", seconds: 1.5 }]);
  });

  it("is a no-op on kept words", () => {
    const removed = removeRange(createTranscript(SPOKEN), 2, 2);

    expect(restoreRange(removed, 0, 1)).toBe(removed);
  });

  it("is a no-op when nothing is removed", () => {
    const transcript = createTranscript(SPOKEN);

    expect(restoreRange(transcript, 0, 3)).toBe(transcript);
  });

  it("clamps the end of the range to the last word", () => {
    const removed = removeRange(createTranscript(SPOKEN), 2, 3);

    const restored = restoreRange(removed, 2, 99);

    expect(restored.removedWordIds).toEqual([]);
  });

  it("rejects a range that does not start on a word", () => {
    const removed = removeRange(createTranscript(SPOKEN), 1, 2);

    expect(() => restoreRange(removed, 4, 4)).toThrow(TranscriptError);
    expect(() => restoreRange(removed, -1, 1)).toThrow(TranscriptError);
    expect(() => restoreRange(removed, 2, 1)).toThrow(TranscriptError);
    expect(() => restoreRange(removed, 0.5, 1)).toThrow(TranscriptError);
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

describe("silence persistence", () => {
  it("omits the key for new and old transcripts", () => {
    const raw = serializeTranscript(createTranscript(SPOKEN));

    expect(raw).not.toContain("silences");
    expect("silences" in createTranscript(SPOKEN)).toBe(false);
    expect(serializeTranscript(parseTranscript(raw))).toBe(raw);
  });

  it("round-trips inserted silences", () => {
    const edited = insertSilence(createTranscript(SPOKEN), "w1", 1.5);
    const parsed = parseTranscript(serializeTranscript(edited));

    expect(parsed.silences).toEqual([{ afterWordId: "w1", seconds: 1.5 }]);
    expect(parsed.words).toEqual(edited.words);
    expect(serializeTranscript(parsed)).toBe(serializeTranscript(edited));
  });

  it("rejects an unknown silence anchor", () => {
    const raw = serializeTranscript(createTranscript(SPOKEN));
    const value = JSON.parse(raw) as Record<string, unknown>;
    value.silences = [{ afterWordId: "w9", seconds: 1 }];

    expect(() => parseTranscript(JSON.stringify(value))).toThrow(TranscriptError);
  });

  it("rejects non-positive and non-finite silence durations", () => {
    const raw = serializeTranscript(createTranscript(SPOKEN));
    const value = JSON.parse(raw) as Record<string, unknown>;

    for (const seconds of [0, -1, Number.NaN, "1"]) {
      value.silences = [{ afterWordId: "w0", seconds }];
      expect(() => parseTranscript(JSON.stringify(value))).toThrow(TranscriptError);
    }
  });
});
