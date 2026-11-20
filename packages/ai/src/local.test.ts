import { describe, expect, it } from "vitest";
import { AiError } from "./types";
import { parseWhisperJson } from "./local";

function cliJson(entries: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({ transcription: entries, ...extra });
}

describe("parseWhisperJson", () => {
  it("turns millisecond offsets into seconds", () => {
    const result = parseWhisperJson(
      cliJson([
        { text: " hello", offsets: { from: 0, to: 500 } },
        { text: " world", offsets: { from: 520, to: 1000 } },
      ]),
    );

    expect(result.words).toEqual([
      { text: "hello", start: 0, end: 0.5 },
      { text: "world", start: 0.52, end: 1 },
    ]);
    expect(result.text).toBe("hello world");
  });

  it("skips entries with no text", () => {
    const result = parseWhisperJson(
      cliJson([
        { text: "", offsets: { from: 0, to: 100 } },
        { text: "kept", offsets: { from: 200, to: 400 } },
      ]),
    );

    expect(result.words).toHaveLength(1);
    expect(result.words[0]?.text).toBe("kept");
  });

  it("reports an empty transcription without throwing", () => {
    const result = parseWhisperJson(cliJson([]));

    expect(result.words).toEqual([]);
    expect(result.text).toBe("");
    expect(result.language).toBeNull();
  });

  it("passes through a language when the CLI reports one", () => {
    expect(parseWhisperJson(cliJson([], { result: { language: "en" } })).language).toBe("en");
  });

  it("fails on offsets that are not numbers", () => {
    expect(() =>
      parseWhisperJson(cliJson([{ text: "bad", offsets: { from: "0", to: 100 } }])),
    ).toThrow(AiError);
    expect(() => parseWhisperJson(cliJson([{ text: "bad" }]))).toThrow(AiError);
  });

  it("fails on a document without a transcription array", () => {
    expect(() => parseWhisperJson("{}")).toThrow(AiError);
    expect(() => parseWhisperJson("not json")).toThrow(AiError);
  });
});
