import { describe, expect, it } from "vitest";
import { createTranscript, insertSilence, moveRange, removeRange } from "@verbal/core";
import { computeTalkItems, computeTalkRanges } from "./talk-ranges";

const SPOKEN = [
  { text: "one", start: 0, end: 1 },
  { text: "two", start: 1, end: 2 },
  { text: "three", start: 2, end: 3 },
  { text: "four", start: 3, end: 4 },
];

describe("computeTalkItems", () => {
  function items(transcript: ReturnType<typeof createTranscript>, endWordId = "w3") {
    return computeTalkItems({ transcript, startWordId: "w0", endWordId });
  }

  it("follows transcript order after a move", () => {
    const transcript = moveRange(createTranscript(SPOKEN), 1, 1, 2);

    expect(items(transcript, "w1")).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1 },
      { kind: "video", startSeconds: 2, endSeconds: 3 },
      { kind: "video", startSeconds: 1, endSeconds: 2 },
    ]);
  });

  it("adds a silence item for inserted air", () => {
    const transcript = insertSilence(
      createTranscript([
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 1, end: 2 },
      ]),
      "w0",
      1.5,
    );

    expect(items(transcript, "w1")).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1 },
      { kind: "silence", durationSeconds: 1.5 },
      { kind: "video", startSeconds: 1, endSeconds: 2 },
    ]);
  });

  it("renders a silence attached to a removed word", () => {
    const base = createTranscript([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 1, end: 2 },
      { text: "three", start: 2, end: 3 },
    ]);
    const transcript = removeRange(insertSilence(base, "w1", 1.5), 1, 1);

    expect(items(transcript, "w2")).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 0.95 },
      { kind: "silence", durationSeconds: 1.5 },
      { kind: "video", startSeconds: 2.05, endSeconds: 3 },
    ]);
  });

  it("carries the silence with a moved word", () => {
    const base = createTranscript([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 1, end: 2 },
      { text: "three", start: 2, end: 3 },
    ]);
    const transcript = moveRange(insertSilence(base, "w1", 1.5), 1, 1, 2);

    expect(items(transcript, "w1")).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1 },
      { kind: "video", startSeconds: 2, endSeconds: 3 },
      { kind: "video", startSeconds: 1, endSeconds: 2 },
      { kind: "silence", durationSeconds: 1.5 },
    ]);
  });

  it("keeps a natural source pause inside one range", () => {
    const transcript = createTranscript([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 3, end: 4 },
    ]);

    expect(items(transcript, "w1")).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 4 },
    ]);
  });

  it("keeps pauses between untouched ASR words", () => {
    const transcript = createTranscript([
      { text: "a", start: 0, end: 1 },
      { text: "b", start: 1.4, end: 2 },
      { text: "c", start: 2.6, end: 3 },
    ]);

    expect(items(transcript, "w2")).toEqual([{ kind: "video", startSeconds: 0, endSeconds: 3 }]);
  });

  it("splits a moved passage because the moved word lies in the gap", () => {
    const base = createTranscript([
      { text: "a", start: 0, end: 1 },
      { text: "b", start: 1.4, end: 2 },
      { text: "c", start: 2.6, end: 3 },
    ]);
    const transcript = moveRange(base, 1, 1, 2);

    expect(items(transcript, "w1")).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1 },
      { kind: "video", startSeconds: 2.6, endSeconds: 3 },
      { kind: "video", startSeconds: 1.4, endSeconds: 2 },
    ]);
  });

  it("merges contiguous kept words into one range", () => {
    expect(items(createTranscript(SPOKEN))).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 4 },
    ]);
  });

  it("applies a deletion and a move together", () => {
    const base = createTranscript(SPOKEN);
    const transcript = moveRange(removeRange(base, 1, 1), 2, 2, 1);

    expect(items(transcript, "w3")).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1 },
      { kind: "video", startSeconds: 2, endSeconds: 4 },
    ]);
  });

  it("leaves a scene outside the anchors alone", () => {
    const transcript = createTranscript(SPOKEN);

    expect(
      computeTalkItems({ transcript, startWordId: "w1", endWordId: "w2" }),
    ).toEqual([{ kind: "video", startSeconds: 1, endSeconds: 3 }]);
  });

  it("merges overlapping words with no edit between them", () => {
    const transcript = createTranscript([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 0.8, end: 2 },
    ]);

    expect(items(transcript, "w1")).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 2 },
    ]);
  });

  it("merges a short word nested inside a longer word", () => {
    const transcript = createTranscript([
      { text: "one", start: 0, end: 2 },
      { text: "two", start: 1, end: 1.5 },
    ]);

    expect(items(transcript, "w1")).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 2 },
    ]);
  });

  it("keeps overlapping words split when a deletion lies between them", () => {
    const transcript = removeRange(
      createTranscript([
        { text: "one", start: 0, end: 1 },
        { text: "cut", start: 1.1, end: 1.2 },
        { text: "two", start: 0.8, end: 2 },
      ]),
      1,
      1,
    );

    expect(items(transcript, "w2")).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1.05 },
      { kind: "video", startSeconds: 1.25, endSeconds: 2 },
    ]);
  });

  it("keeps overlapping words split when they are reordered", () => {
    const transcript = moveRange(
      createTranscript([
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 0.8, end: 2 },
      ]),
      1,
      1,
      0,
    );

    expect(
      computeTalkItems({ transcript, startWordId: "w1", endWordId: "w0" }),
    ).toEqual([
      { kind: "video", startSeconds: 0.8, endSeconds: 2 },
      { kind: "video", startSeconds: 0, endSeconds: 1 },
    ]);
  });
});

describe("removal-only equivalence", () => {
  const GAPS = [
    { text: "a", start: 0, end: 1 },
    { text: "b", start: 1.4, end: 2 },
    { text: "c", start: 2.6, end: 3 },
  ];

  function compare(transcript: ReturnType<typeof createTranscript>, endSeconds: number): void {
    const videos = computeTalkItems({
      transcript,
      startWordId: "w0",
      endWordId: `w${transcript.words.length - 1}`,
    }).flatMap((item) =>
      item.kind === "video"
        ? [{ startSeconds: item.startSeconds, endSeconds: item.endSeconds }]
        : [],
    );
    const ranges = computeTalkRanges({ startSeconds: 0, endSeconds, transcript });

    expect(videos.length).toBe(ranges.length);
    videos.forEach((video, index) => {
      expect(video.startSeconds).toBeCloseTo(ranges[index]?.startSeconds ?? Number.NaN, 6);
      expect(video.endSeconds).toBeCloseTo(ranges[index]?.endSeconds ?? Number.NaN, 6);
    });
  }

  it("matches with no removals and natural gaps", () => {
    compare(createTranscript(GAPS), 3);
  });

  it("matches with one removed middle word", () => {
    compare(removeRange(createTranscript(GAPS), 1, 1), 3);
  });

  it("matches with the first word removed", () => {
    compare(removeRange(createTranscript(GAPS), 0, 0), 3);
  });

  it("matches with two adjacent removed words", () => {
    compare(removeRange(createTranscript(SPOKEN), 1, 2), 4);
  });

  it("matches a seeded 40-word fixture with six removals", () => {
    let seed = 42;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const words = [];
    let cursor = 0;
    for (let index = 0; index < 40; index += 1) {
      const start = index === 0 ? 0 : cursor + random();
      const end = start + 0.2 + random() * 0.3;
      words.push({ text: `w${index}`, start, end });
      cursor = end;
    }

    let transcript = createTranscript(words);
    for (const index of [3, 7, 12, 19, 28, 35]) {
      transcript = removeRange(transcript, index, index);
    }

    compare(transcript, cursor);
  });
});

describe("computeTalkRanges", () => {
  it("returns one range equal to the scene when nothing is removed", () => {
    const ranges = computeTalkRanges({
      startSeconds: 0,
      endSeconds: 3,
      transcript: createTranscript(SPOKEN),
    });

    expect(ranges).toEqual([{ startSeconds: 0, endSeconds: 3 }]);
  });

  it("splits around a removed middle word and its handles", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 1, 1);

    const ranges = computeTalkRanges({
      startSeconds: 0,
      endSeconds: 3,
      transcript,
    });

    expect(ranges).toEqual([
      { startSeconds: 0, endSeconds: 0.95 },
      { startSeconds: 2.05, endSeconds: 3 },
    ]);
  });

  it("returns one shorter range when the removed word starts the scene", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 0, 0);

    const ranges = computeTalkRanges({
      startSeconds: 0,
      endSeconds: 3,
      transcript,
    });

    expect(ranges).toEqual([{ startSeconds: 1.05, endSeconds: 3 }]);
  });

  it("returns no ranges when every word is removed", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 0, 3);

    const ranges = computeTalkRanges({
      startSeconds: 0,
      endSeconds: 4,
      transcript,
    });

    expect(ranges).toEqual([]);
  });

  it("merges two adjacent removed words into one gap", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 1, 2);

    const ranges = computeTalkRanges({
      startSeconds: 0,
      endSeconds: 4,
      transcript,
    });

    expect(ranges).toEqual([
      { startSeconds: 0, endSeconds: 0.95 },
      { startSeconds: 3.05, endSeconds: 4 },
    ]);
  });

  it("leaves a scene unchanged by a removal outside it", () => {
    const transcript = removeRange(createTranscript(SPOKEN), 3, 3);

    const ranges = computeTalkRanges({
      startSeconds: 0,
      endSeconds: 2,
      transcript,
    });

    expect(ranges).toEqual([{ startSeconds: 0, endSeconds: 2 }]);
  });

  it("drops a kept fragment shorter than 0.05 seconds", () => {
    const transcript = removeRange(
      createTranscript([
        { text: "a", start: 0, end: 1 },
        { text: "b", start: 1, end: 1.5 },
        { text: "c", start: 1.63, end: 2 },
        { text: "d", start: 2, end: 3 },
      ]),
      1,
      2,
    );

    const ranges = computeTalkRanges({
      startSeconds: 0,
      endSeconds: 3,
      transcript,
    });

    expect(ranges).toEqual([
      { startSeconds: 0, endSeconds: 0.95 },
      { startSeconds: 2.05, endSeconds: 3 },
    ]);
  });
});
