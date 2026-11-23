import { describe, expect, it } from "vitest";
import { countWords, formatReadTime, readTimeSeconds, splitBeats } from "./beats";

describe("splitBeats", () => {
  it("splits on sentence endings but keeps the punctuation", () => {
    const beats = splitBeats("Hello there. How are you?\n\nFine!");
    expect(beats.map((beat) => beat.text)).toEqual([
      "Hello there.",
      "How are you?",
      "Fine!",
    ]);
    expect(beats.map((beat) => beat.id)).toEqual(["b0", "b1", "b2"]);
  });

  it("keeps a line without punctuation as one beat", () => {
    expect(splitBeats("Just one line without punctuation").map((beat) => beat.text)).toEqual([
      "Just one line without punctuation",
    ]);
  });

  it("splits on line breaks too", () => {
    expect(splitBeats("First\nSecond").map((beat) => beat.text)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("trims and drops empty beats", () => {
    expect(splitBeats("  \n\n  ")).toEqual([]);
  });

  it("counts words per beat", () => {
    const beats = splitBeats("One two three. Four five.");
    expect(beats.map((beat) => beat.wordCount)).toEqual([3, 2]);
  });

  it("gives the same ids for the same text", () => {
    expect(splitBeats("One. Two.")).toEqual(splitBeats("One. Two."));
  });
});

describe("read time", () => {
  it("counts words", () => {
    expect(countWords("one two  three")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });

  it("reads 150 words in one minute", () => {
    expect(readTimeSeconds(150)).toBe(60);
    expect(readTimeSeconds(75)).toBe(30);
    expect(readTimeSeconds(0)).toBe(0);
  });

  it("formats m:ss", () => {
    expect(formatReadTime(60)).toBe("1:00");
    expect(formatReadTime(5)).toBe("0:05");
    expect(formatReadTime(0)).toBe("0:00");
  });
});
