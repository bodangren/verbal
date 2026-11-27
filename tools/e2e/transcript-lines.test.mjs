import { describe, expect, it } from "vitest";
import { countVisibleTranscriptLines } from "./transcript-lines.mjs";

const box = { top: 100, bottom: 300 };

describe("countVisibleTranscriptLines", () => {
  it("ignores words fully outside the transcript rectangle", () => {
    const words = [
      { top: 0, bottom: 20 },
      { top: 320, bottom: 340 },
    ];
    expect(countVisibleTranscriptLines(words, box)).toBe(0);
  });

  it("counts partially intersecting words on one line as one line", () => {
    const words = [
      { top: 99, bottom: 119 },
      { top: 100, bottom: 120 },
      { top: 101, bottom: 121 },
    ];
    expect(countVisibleTranscriptLines(words, box)).toBe(1);
  });

  it("groups words into lines by top coordinate", () => {
    const words = [
      { top: 100, bottom: 120 },
      { top: 101, bottom: 121 },
      { top: 140, bottom: 160 },
      { top: 180, bottom: 200 },
    ];
    expect(countVisibleTranscriptLines(words, box)).toBe(3);
  });

  it("returns zero when no words are given", () => {
    expect(countVisibleTranscriptLines([], box)).toBe(0);
  });

  it("ignores words below the clip rectangle of a scrolling stage", () => {
    const words = [
      { top: 100, bottom: 120 },
      { top: 140, bottom: 160 },
      { top: 220, bottom: 240 },
      { top: 260, bottom: 280 },
    ];
    expect(countVisibleTranscriptLines(words, box, { top: 90, bottom: 200 })).toBe(2);
  });
});
