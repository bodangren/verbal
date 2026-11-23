import { describe, expect, it } from "vitest";
import type { TakeAlignment } from "./align";
import { buildEdl, edlTranscript } from "./edl";

const alignment: TakeAlignment = {
  beats: [
    {
      beatId: "b0",
      index: 0,
      status: "good",
      coverage: 1,
      confidence: 1,
      startSeconds: 0,
      endSeconds: 2,
      spokeText: "",
    },
    {
      beatId: "b1",
      index: 1,
      status: "bungled",
      coverage: 0.5,
      confidence: 0.5,
      startSeconds: 2.5,
      endSeconds: 4,
      spokeText: "",
    },
    {
      beatId: "b2",
      index: 2,
      status: "good",
      coverage: 1,
      confidence: 1,
      startSeconds: 4.1,
      endSeconds: 6,
      spokeText: "",
    },
  ],
};

describe("buildEdl", () => {
  it("keeps good beats with 100 ms handles", () => {
    const edl = buildEdl(alignment, { takeId: "take-1", durationSeconds: 10 });

    expect(edl.ranges).toEqual([
      { takeId: "take-1", startSeconds: 0, endSeconds: 2.1 },
      { takeId: "take-1", startSeconds: 4, endSeconds: 6.1 },
    ]);
  });

  it("merges overlapping ranges", () => {
    const edl = buildEdl(
      {
        beats: [
          { ...alignment.beats[0]!, startSeconds: 0, endSeconds: 2 },
          { ...alignment.beats[2]!, startSeconds: 2.05, endSeconds: 4 },
        ],
      },
      { takeId: "take-1" },
    );

    expect(edl.ranges).toEqual([
      { takeId: "take-1", startSeconds: 0, endSeconds: 4.1 },
    ]);
  });

  it("can keep bungled beats and merges the neighbours", () => {
    const edl = buildEdl(alignment, {
      takeId: "take-1",
      keep: ["good", "bungled"],
    });

    expect(edl.ranges).toEqual([
      { takeId: "take-1", startSeconds: 0, endSeconds: 2.1 },
      { takeId: "take-1", startSeconds: 2.4, endSeconds: 6.1 },
    ]);
  });

  it("returns no ranges when nothing is kept", () => {
    expect(
      buildEdl(
        { beats: [{ ...alignment.beats[1]!, status: "skipped" }] },
        { takeId: "take-1" },
      ).ranges,
    ).toEqual([]);
  });

  it("clamps to the take duration", () => {
    const edl = buildEdl(
      {
        beats: [
          {
            ...alignment.beats[0]!,
            startSeconds: 9.5,
            endSeconds: 9.95,
          },
        ],
      },
      { takeId: "take-1", durationSeconds: 10 },
    );

    expect(edl.ranges).toEqual([
      { takeId: "take-1", startSeconds: 9.4, endSeconds: 10 },
    ]);
  });
});

describe("edlTranscript", () => {
  const words = [
    { text: "hello", start: 0, end: 0.5 },
    { text: "world", start: 0.5, end: 1 },
    { text: "skip", start: 2.5, end: 3 },
    { text: "this", start: 4.2, end: 4.6 },
  ];

  it("drops cut words and shifts the kept words", () => {
    const result = edlTranscript(
      [
        { takeId: "take-1", startSeconds: 0, endSeconds: 2 },
        { takeId: "take-1", startSeconds: 4, endSeconds: 6 },
      ],
      { "take-1": words },
    );

    expect(result.map((word) => word.text)).toEqual(["hello", "world", "this"]);
    expect(result[2]?.start).toBeCloseTo(2.2);
    expect(result[2]?.end).toBeCloseTo(2.6);
  });

  it("returns nothing for an empty edit", () => {
    expect(edlTranscript([], { "take-1": words })).toEqual([]);
  });
});
