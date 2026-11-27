import { describe, expect, it } from "vitest";
import { createTranscript, insertSilence, moveRange, removeRange } from "@verbal/core";
import { buildCutList } from "./cutlist";
import { buildTimeline } from "./timeline";

const SPOKEN = [
  { text: "one", start: 0, end: 1 },
  { text: "two", start: 1, end: 2 },
  { text: "three", start: 2, end: 3 },
  { text: "four", start: 3, end: 4 },
];

describe("buildTimeline", () => {
  it("follows transcript order after a move", () => {
    const transcript = moveRange(
      createTranscript([
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 1, end: 2 },
        { text: "three", start: 2, end: 3 },
      ]),
      1,
      1,
      2,
    );

    expect(buildTimeline({ transcript })).toEqual([
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

    expect(buildTimeline({ transcript })).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1 },
      { kind: "silence", durationSeconds: 1.5 },
      { kind: "video", startSeconds: 1, endSeconds: 2 },
    ]);
  });

  it("applies a deletion and a move together", () => {
    const base = createTranscript(SPOKEN);
    const transcript = moveRange(removeRange(base, 1, 1), 2, 2, 1);

    expect(buildTimeline({ transcript })).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1 },
      { kind: "video", startSeconds: 2, endSeconds: 4 },
    ]);
  });

  it("keeps a natural source pause inside one range", () => {
    const transcript = createTranscript([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 3, end: 4 },
    ]);

    expect(buildTimeline({ transcript })).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 4 },
    ]);
  });

  it("renders a silence attached to a removed word", () => {
    const base = createTranscript([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 1, end: 2 },
      { text: "three", start: 2, end: 3 },
    ]);
    const transcript = removeRange(insertSilence(base, "w1", 1.5), 1, 1);

    expect(buildTimeline({ transcript })).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 0.95 },
      { kind: "silence", durationSeconds: 1.5 },
      { kind: "video", startSeconds: 2.05, endSeconds: 3 },
    ]);
  });

  it("extends an unedited transcript to the full media duration", () => {
    const transcript = createTranscript([
      { text: "start", start: 2, end: 30 },
      { text: "end", start: 31, end: 58 },
    ]);

    const items = buildTimeline({ transcript, durationSeconds: 60 });

    expect(items).toEqual([{ kind: "video", startSeconds: 0, endSeconds: 60 }]);
    expect(items.map((item) =>
      item.kind === "video" ? { start: item.startSeconds, end: item.endSeconds } : item,
    )).toEqual(buildCutList({ transcript, durationSeconds: 60 }).kept);
  });

  it("does not extend the head when the first word is removed", () => {
    const transcript = removeRange(
      createTranscript([
        { text: "cut", start: 0, end: 1 },
        { text: "keep", start: 2, end: 3 },
      ]),
      0,
      0,
    );

    expect(buildTimeline({ transcript, durationSeconds: 60 })).toEqual([
      { kind: "video", startSeconds: 1.05, endSeconds: 60 },
    ]);
  });

  it("does not extend the tail when the last word is removed", () => {
    const transcript = removeRange(
      createTranscript([
        { text: "keep", start: 0, end: 1 },
        { text: "cut", start: 2, end: 3 },
      ]),
      1,
      1,
    );

    expect(buildTimeline({ transcript, durationSeconds: 60 })).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1.95 },
    ]);
  });

  it("does not extend head or tail when the transcript is reordered", () => {
    const transcript = moveRange(
      createTranscript([
        { text: "one", start: 2, end: 3 },
        { text: "two", start: 4, end: 5 },
        { text: "three", start: 6, end: 7 },
      ]),
      1,
      1,
      2,
    );

    expect(buildTimeline({ transcript, durationSeconds: 60 })).toEqual([
      { kind: "video", startSeconds: 2, endSeconds: 3 },
      { kind: "video", startSeconds: 6, endSeconds: 7 },
      { kind: "video", startSeconds: 4, endSeconds: 5 },
    ]);
  });
});

describe("buildCutList output stays stable", () => {
  it("keeps its deletion-only output without reorder or silence", () => {
    const transcript = removeRange(
      createTranscript([
        { text: "hello", start: 0, end: 0.4 },
        { text: "world", start: 0.45, end: 0.9 },
        { text: "again", start: 1.8, end: 2.2 },
      ]),
      1,
      1,
    );

    expect(
      buildCutList({ transcript, durationSeconds: 3, handleSeconds: 0.05 }),
    ).toMatchInlineSnapshot(`
      {
        "durationSeconds": 3,
        "kept": [
          {
            "end": 0.4,
            "start": 0,
          },
          {
            "end": 3,
            "start": 0.95,
          },
        ],
        "keptDurationSeconds": 2.45,
        "removed": [
          {
            "end": 0.95,
            "start": 0.4,
          },
        ],
      }
    `);
  });
});
