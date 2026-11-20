import { describe, expect, it } from "vitest";
import { createTranscript, removeRange } from "@verbal/core";
import { buildCutList, CutListError, serializeCutList } from "./cutlist";

const SPOKEN = [
  { text: "hello", start: 0, end: 0.4 },
  { text: "world", start: 0.45, end: 0.9 },
  { text: "again", start: 1.8, end: 2.2 },
];

describe("buildCutList", () => {
  it("keeps the whole media when nothing is removed", () => {
    const cutList = buildCutList({
      transcript: createTranscript(SPOKEN),
      durationSeconds: 3,
    });

    expect(cutList.kept).toEqual([{ start: 0, end: 3 }]);
    expect(cutList.removed).toEqual([]);
    expect(cutList.keptDurationSeconds).toBe(3);
  });

  it("splits the timeline around a removed word and its handles", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 1, 1);

    const cutList = buildCutList({ transcript, durationSeconds: 3, handleSeconds: 0.05 });

    expect(cutList.removed).toEqual([{ start: 0.4, end: 0.95 }]);
    expect(cutList.kept).toEqual([
      { start: 0, end: 0.4 },
      { start: 0.95, end: 3 },
    ]);
    expect(cutList.keptDurationSeconds).toBe(2.45);
  });

  it("clamps a handle to the start of the media", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 0, 0);

    const cutList = buildCutList({ transcript, durationSeconds: 3, handleSeconds: 0.1 });

    expect(cutList.removed).toEqual([{ start: 0, end: 0.5 }]);
    expect(cutList.kept).toEqual([{ start: 0.5, end: 3 }]);
  });

  it("merges removed words that are adjacent", () => {
    const transcript = createTranscript([
      { text: "one", start: 0, end: 0.5 },
      { text: "two", start: 0.5, end: 1 },
      { text: "three", start: 1.5, end: 2 },
    ]);

    const cutList = buildCutList({
      transcript: removeRange(transcript, 0, 1),
      durationSeconds: 3,
      handleSeconds: 0,
    });

    expect(cutList.removed).toEqual([{ start: 0, end: 1 }]);
    expect(cutList.kept).toEqual([{ start: 1, end: 3 }]);
  });

  it("returns an explicitly empty result when everything is removed", () => {
    const cutList = buildCutList({
      transcript: removeRange(createTranscript(SPOKEN), 0, 2),
      durationSeconds: 3,
      handleSeconds: 0,
    });

    expect(cutList.kept).toEqual([]);
    expect(cutList.removed).toEqual([{ start: 0, end: 3 }]);
    expect(cutList.keptDurationSeconds).toBe(0);
  });

  it("drops kept slivers shorter than the minimum gap", () => {
    const transcript = createTranscript([
      { text: "a", start: 0, end: 0.5 },
      { text: "b", start: 1, end: 1.2 },
      { text: "c", start: 1.21, end: 1.4 },
      { text: "d", start: 2, end: 2.5 },
    ]);

    const cutList = buildCutList({
      transcript: removeRange(transcript, 1, 2),
      durationSeconds: 3,
      handleSeconds: 0,
      minKeepGapSeconds: 0.02,
    });

    expect(cutList.kept).toEqual([
      { start: 0, end: 1 },
      { start: 1.4, end: 3 },
    ]);
    expect(cutList.removed).toEqual([{ start: 1, end: 1.4 }]);
  });

  it("keeps a short but intentional gap when the threshold is zero", () => {
    const transcript = createTranscript([
      { text: "a", start: 0, end: 0.5 },
      { text: "b", start: 1, end: 1.2 },
      { text: "c", start: 1.21, end: 1.4 },
    ]);

    const cutList = buildCutList({
      transcript: removeRange(transcript, 1, 2),
      durationSeconds: 3,
      handleSeconds: 0,
      minKeepGapSeconds: 0,
    });

    expect(cutList.kept).toEqual([
      { start: 0, end: 1 },
      { start: 1.2, end: 1.21 },
      { start: 1.4, end: 3 },
    ]);
  });

  it("rejects a non-positive duration", () => {
    expect(() =>
      buildCutList({ transcript: createTranscript(SPOKEN), durationSeconds: 0 }),
    ).toThrow(CutListError);
  });

  it("rejects a negative handle", () => {
    expect(() =>
      buildCutList({
        transcript: createTranscript(SPOKEN),
        durationSeconds: 3,
        handleSeconds: -0.1,
      }),
    ).toThrow(CutListError);
  });
});

describe("serializeCutList", () => {
  it("is deterministic across runs", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 1, 1);
    const first = serializeCutList(buildCutList({ transcript, durationSeconds: 3 }));
    const second = serializeCutList(buildCutList({ transcript, durationSeconds: 3 }));

    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
  });

  it("rounds timestamps to microseconds so floating point noise cannot drift", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 1, 1);

    const text = serializeCutList(
      buildCutList({ transcript, durationSeconds: 3, handleSeconds: 0.05 }),
    );

    expect(text).toContain('"start": 0.4');
    expect(text).not.toContain("4000000");
  });
});
