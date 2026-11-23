import { describe, expect, it } from "vitest";
import {
  advanceWords,
  clampFontSize,
  clampWpm,
  lineForWord,
  wordsPerSecond,
} from "./prompter-clock";

describe("prompter clock", () => {
  it("converts words per minute", () => {
    expect(wordsPerSecond(150)).toBeCloseTo(2.5);
    expect(wordsPerSecond(0)).toBe(0);
    expect(wordsPerSecond(-10)).toBe(0);
    expect(wordsPerSecond(Number.NaN)).toBe(0);
  });

  it("advances by words over time", () => {
    expect(advanceWords(0, 150, 2)).toBeCloseTo(5);
    expect(advanceWords(10, 60, 1)).toBeCloseTo(11);
    expect(advanceWords(10, 60, -1)).toBe(10);
  });

  it("maps words to lines", () => {
    expect(lineForWord(0, 8)).toBe(0);
    expect(lineForWord(8, 8)).toBe(1);
    expect(lineForWord(15, 8)).toBe(1);
    expect(lineForWord(10, 0)).toBe(0);
  });

  it("clamps speed and size", () => {
    expect(clampWpm(10)).toBe(60);
    expect(clampWpm(1000)).toBe(300);
    expect(clampFontSize(10)).toBe(24);
    expect(clampFontSize(200)).toBe(96);
  });
});
