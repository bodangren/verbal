import { describe, expect, it } from "vitest";
import {
  createTranscript,
  insertSilence,
  moveRange,
  removeRange,
  type TranscriptDocument,
} from "@verbal/core";
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

  it("keeps the tail after a removed last word", () => {
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
      { kind: "video", startSeconds: 3.05, endSeconds: 60 },
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

  it("keeps the whole file for an empty transcript", () => {
    const transcript: TranscriptDocument = {
      schemaVersion: 1,
      words: [],
      segments: [],
      removedWordIds: [],
    };

    expect(buildTimeline({ transcript, durationSeconds: 60 })).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 60 },
    ]);
  });

  it("keeps the head before a removed first word", () => {
    const transcript = removeRange(
      createTranscript([
        { text: "a", start: 2, end: 3 },
        { text: "b", start: 3, end: 4 },
        { text: "c", start: 4, end: 58 },
      ]),
      0,
      0,
    );

    expect(buildTimeline({ transcript, durationSeconds: 60 })).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 1.95 },
      { kind: "video", startSeconds: 3.05, endSeconds: 60 },
    ]);
  });

  it("never emits a reversed or empty range for overlapping removals", () => {
    const transcript = removeRange(
      createTranscript([
        { text: "a", start: 0, end: 1 },
        { text: "b", start: 0.5, end: 1.5 },
        { text: "c", start: 1.4, end: 2 },
        { text: "d", start: 2.4, end: 3 },
      ]),
      1,
      2,
    );

    const videos = buildTimeline({ transcript, durationSeconds: 4 }).filter(
      (item): item is { kind: "video"; startSeconds: number; endSeconds: number } =>
        item.kind === "video",
    );
    expect(videos.length).toBeGreaterThan(0);
    for (const video of videos) {
      expect(video.endSeconds).toBeGreaterThan(video.startSeconds);
    }
    expect(videos).toEqual([
      { kind: "video", startSeconds: 0, endSeconds: 0.45 },
      { kind: "video", startSeconds: 2.05, endSeconds: 4 },
    ]);
  });

  it("keeps a combined delete, reorder and silence valid", () => {
    const base = createTranscript([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 1, end: 2 },
      { text: "three", start: 2, end: 3 },
      { text: "four", start: 3, end: 4 },
    ]);
    const transcript = moveRange(
      removeRange(insertSilence(base, "w1", 1.5), 2, 2),
      3,
      3,
      0,
    );

    const items = buildTimeline({ transcript, durationSeconds: 5 });
    for (const item of items) {
      if (item.kind === "video") {
        expect(item.endSeconds).toBeGreaterThan(item.startSeconds);
      }
    }
  });

  it("matches buildCutList over generated deletion-only transcripts", () => {
    let seed = 123456789;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };

    for (let run = 0; run < 100; run += 1) {
      const count = Math.floor(random() * 20);
      const spoken: { text: string; start: number; end: number }[] = [];
      let cursor = random() * 2;
      for (let index = 0; index < count; index += 1) {
        const start = cursor + random() * 0.5;
        const end = start + 0.1 + random() * 0.6;
        spoken.push({ text: `w${index}`, start, end });
        cursor = end;
      }
      const durationSeconds = Math.max(0.5, cursor + random() * 3);

      const base: TranscriptDocument =
        spoken.length === 0
          ? { schemaVersion: 1, words: [], segments: [], removedWordIds: [] }
          : createTranscript(spoken);

      let transcript = base;
      for (let index = 0; index < spoken.length; index += 1) {
        if (random() < 0.3) {
          transcript = removeRange(transcript, index, index);
        }
      }

      const videos = buildTimeline({ transcript, durationSeconds })
        .filter(
          (item): item is { kind: "video"; startSeconds: number; endSeconds: number } =>
            item.kind === "video",
        )
        .map((item) => ({ startSeconds: item.startSeconds, endSeconds: item.endSeconds }));

      const kept = buildCutList({ transcript, durationSeconds }).kept.map((range) => ({
        startSeconds: range.start,
        endSeconds: range.end,
      }));

      expect(videos).toEqual(kept);
    }
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
