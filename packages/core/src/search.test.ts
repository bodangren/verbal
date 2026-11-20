import { describe, expect, it } from "vitest";
import { createTranscript, removeWord } from "@verbal/core";
import { searchTranscript } from "./search";

const transcript = createTranscript([
  { text: "Hello,", start: 0, end: 0.4 },
  { text: "world", start: 0.5, end: 0.9 },
  { text: "again", start: 1.5, end: 1.9 },
]);

describe("searchTranscript", () => {
  it("finds a single word", () => {
    expect(searchTranscript(transcript, "world")).toEqual([{ fromIndex: 1, toIndex: 1 }]);
  });

  it("finds a phrase spanning word boundaries", () => {
    expect(searchTranscript(transcript, "hello world")).toEqual([{ fromIndex: 0, toIndex: 1 }]);
  });

  it("ignores case and punctuation on both sides", () => {
    expect(searchTranscript(transcript, "HELLO,")).toEqual([{ fromIndex: 0, toIndex: 0 }]);
    expect(searchTranscript(transcript, "hello world again")).toEqual([
      { fromIndex: 0, toIndex: 2 },
    ]);
  });

  it("returns every occurrence in transcript order", () => {
    const repeated = createTranscript([
      { text: "I", start: 0, end: 0.2 },
      { text: "think", start: 0.3, end: 0.5 },
      { text: "I", start: 0.6, end: 0.8 },
      { text: "think", start: 0.9, end: 1.1 },
    ]);

    expect(searchTranscript(repeated, "think")).toEqual([
      { fromIndex: 1, toIndex: 1 },
      { fromIndex: 3, toIndex: 3 },
    ]);
  });

  it("returns nothing for a blank or missing query", () => {
    expect(searchTranscript(transcript, "")).toEqual([]);
    expect(searchTranscript(transcript, "   ")).toEqual([]);
  });

  it("returns nothing when the query does not occur", () => {
    expect(searchTranscript(transcript, "goodbye")).toEqual([]);
    expect(searchTranscript(transcript, "hello world again and more")).toEqual([]);
  });

  it("does not match removed words", () => {
    const edited = removeWord(transcript, "w1");

    expect(searchTranscript(edited, "world")).toEqual([]);
  });

  it("does not match a phrase across a removed word", () => {
    const edited = removeWord(transcript, "w1");

    expect(searchTranscript(edited, "hello again")).toEqual([]);
    expect(searchTranscript(edited, "hello")).toEqual([{ fromIndex: 0, toIndex: 0 }]);
  });
});
