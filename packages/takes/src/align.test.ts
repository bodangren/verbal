import { describe, expect, it } from "vitest";
import { alignTake, normalizeToken } from "./align";
import { splitBeats } from "./beats";

const beats = splitBeats("Hello world. This is a test. Goodbye now.");

function words(...texts: string[]): { text: string; start: number; end: number }[] {
  return texts.map((text, index) => ({ text, start: index, end: index + 1 }));
}

describe("normalizeToken", () => {
  it("lowercases, drops punctuation, and keeps digits", () => {
    expect(normalizeToken("Hello,")).toBe("hello");
    expect(normalizeToken("don’t")).toBe("dont");
    expect(normalizeToken("2026")).toBe("2026");
  });
});

describe("alignTake", () => {
  it("marks fully spoken beats good", () => {
    const alignment = alignTake(
      beats,
      words("hello", "world", "this", "is", "a", "test", "goodbye", "now"),
    );

    expect(alignment.beats.map((beat) => beat.status)).toEqual(["good", "good", "good"]);
    expect(alignment.beats[0]?.coverage).toBe(1);
    expect(alignment.beats[0]?.startSeconds).toBe(0);
    expect(alignment.beats[0]?.endSeconds).toBe(2);
  });

  it("marks a misheard word bungled", () => {
    const alignment = alignTake(
      beats,
      words("hello", "word", "this", "is", "a", "test", "goodbye", "now"),
    );

    expect(alignment.beats[0]?.status).toBe("bungled");
    expect(alignment.beats[0]?.coverage).toBe(0.5);
  });

  it("marks unspoken beats skipped", () => {
    const alignment = alignTake(beats, words("hello", "world"));

    expect(alignment.beats.map((beat) => beat.status)).toEqual([
      "good",
      "skipped",
      "skipped",
    ]);
  });

  it("marks extra words between beats improvised", () => {
    const alignment = alignTake(beats, words("hello", "world", "blah", "blah"));

    expect(alignment.beats[0]?.status).toBe("good");
    expect(alignment.beats[1]?.status).toBe("improvised");
    expect(alignment.beats[1]?.spokeText).toBe("blah blah");
    expect(alignment.beats[2]?.status).toBe("skipped");
  });

  it("handles an empty take", () => {
    const alignment = alignTake(beats, []);

    expect(alignment.beats.map((beat) => beat.status)).toEqual([
      "skipped",
      "skipped",
      "skipped",
    ]);
    expect(alignment.beats.every((beat) => beat.startSeconds === null)).toBe(true);
  });
});
