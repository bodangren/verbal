import { describe, expect, it } from "vitest";
import { createTranscript } from "./transcript";
import { wordAtTime, wordIndexAtTime } from "./sync";

const transcript = createTranscript([
  { text: "hello", start: 0, end: 0.4 },
  { text: "world", start: 0.45, end: 0.9 },
  { text: "again", start: 1.8, end: 2.2 },
]);

describe("wordIndexAtTime", () => {
  it("returns -1 before the first word", () => {
    expect(wordIndexAtTime(transcript.words, -0.5)).toBe(-1);
  });

  it("returns -1 for an empty word list", () => {
    expect(wordIndexAtTime([], 1)).toBe(-1);
  });

  it("finds the word at its exact start", () => {
    expect(wordIndexAtTime(transcript.words, 0.45)).toBe(1);
  });

  it("finds the word at its exact end", () => {
    expect(wordIndexAtTime(transcript.words, 0.9)).toBe(1);
  });

  it("finds the word inside its range", () => {
    expect(wordIndexAtTime(transcript.words, 1.9)).toBe(2);
  });

  it("holds the previous word through a silence gap", () => {
    expect(wordIndexAtTime(transcript.words, 1.2)).toBe(1);
  });

  it("holds the last word after the transcript ends", () => {
    expect(wordIndexAtTime(transcript.words, 60)).toBe(2);
  });

  it("handles a single word", () => {
    const single = createTranscript([{ text: "solo", start: 1, end: 2 }]);

    expect(wordIndexAtTime(single.words, 1.5)).toBe(0);
    expect(wordIndexAtTime(single.words, 0.5)).toBe(-1);
  });
});

describe("wordAtTime", () => {
  it("returns the word for a position", () => {
    expect(wordAtTime(transcript.words, 1.9)?.text).toBe("again");
  });

  it("returns null before the first word", () => {
    expect(wordAtTime(transcript.words, -1)).toBeNull();
  });
});
