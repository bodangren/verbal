import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AiError } from "./types";
import {
  appendStderrTail,
  describeExit,
  parseWhisperJson,
  parseWhisperProgress,
} from "./local";

function cliJson(entries: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({ transcription: entries, ...extra });
}

function fixture(name: string): string {
  return readFileSync(new URL(`../testdata/whisper/${name}`, import.meta.url), "utf8");
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

  it("drops bracket and parenthesis tags but keeps brackets inside words", () => {
    const result = parseWhisperJson(
      cliJson([
        { text: "[MUSIC]", offsets: { from: 0, to: 100 } },
        { text: "[เสียงดนตรี]", offsets: { from: 100, to: 200 } },
        { text: "(music)", offsets: { from: 200, to: 300 } },
        { text: "[BLANK_AUDIO]", offsets: { from: 300, to: 400 } },
        { text: " a[1]", offsets: { from: 400, to: 500 } },
      ]),
    );

    expect(result.words).toEqual([{ text: "a[1]", start: 0.4, end: 0.5 }]);
    expect(result.text).toBe("a[1]");
  });
});

describe("parseWhisperProgress", () => {
  const progressFixture = fixture("progress-stderr.txt");

  it("reads the last percentage from real CLI output", () => {
    expect(parseWhisperProgress(progressFixture)).toBe(1);
  });

  it("reads a single real progress line", () => {
    expect(parseWhisperProgress("whisper_print_progress_callback: progress =  64%\n")).toBe(0.64);
  });

  it("ignores a line split before the percent sign", () => {
    expect(parseWhisperProgress("whisper_print_progress_callback: progress =  6")).toBeNull();
  });

  it("ignores unrelated stderr text", () => {
    expect(parseWhisperProgress("read_audio_data: trying to decode with miniaudio\n")).toBeNull();
    expect(parseWhisperProgress("whisper_print_timings: total time = 10.75 ms")).toBeNull();
  });

  it("ignores values outside the percent range", () => {
    expect(parseWhisperProgress("whisper_print_progress_callback: progress = 140%")).toBeNull();
  });
});

describe("appendStderrTail", () => {
  it("keeps 200 characters and completes a split progress line", () => {
    let seen = appendStderrTail("", "noise ".repeat(100));
    expect(seen.length).toBe(200);

    seen = appendStderrTail(seen, "whisper_print_progress_callback: progress =  4");
    seen = appendStderrTail(seen, "2%\n");

    expect(parseWhisperProgress(seen)).toBe(0.42);
  });
});

describe("describeExit", () => {
  it("keeps the CLI error and drops progress lines", () => {
    const stderr = [
      "whisper_print_progress_callback: progress =  25%",
      "error: failed to read audio file 'x.mp4'",
      "whisper_print_progress_callback: progress = 100%",
    ].join("\n");

    expect(describeExit("whisper-cli", 1, stderr)).toBe(
      "whisper-cli exited with code 1: error: failed to read audio file 'x.mp4'",
    );
  });

  it("keeps the short form when stderr is empty", () => {
    expect(describeExit("whisper-cli", 2, "  \n ")).toBe("whisper-cli exited with code 2");
  });

  it("keeps only the last 500 characters of stderr", () => {
    const stderr = `${"x".repeat(600)}\nerror at the end`;
    const expectedTail = stderr.slice(-500).trim();

    expect(describeExit("whisper-cli", 3, stderr)).toBe(
      `whisper-cli exited with code 3: ${expectedTail}`,
    );
  });

  it("keeps stderr out of the message on success", () => {
    expect(describeExit("whisper-cli", 0, "error: ignored")).toBe(
      "whisper-cli exited with code 0",
    );
  });
});

describe("whisper CLI fixtures", () => {
  it("parses the word-level Thai and English transcript", () => {
    const result = parseWhisperJson(fixture("speech-words-th.json"));

    expect(result.words).toHaveLength(19);
    expect(result.words[0]).toEqual({ text: "อาการผลตรวจ", start: 0, end: 1.21 });
    expect(result.words.find((word) => word.text === "algorithm")).toEqual({
      text: "algorithm",
      start: 3.84,
      end: 4.5,
    });
    expect(result.language).toBe("th");
  });

  it("parses the sentence-level transcript", () => {
    expect(parseWhisperJson(fixture("speech-segments-th.json")).words).toHaveLength(8);
  });

  it("returns no words for a music-only intro", () => {
    const result = parseWhisperJson(fixture("music-only.json"));

    expect(result.words).toEqual([]);
    expect(result.text).toBe("");
    expect(result.language).toBe("th");
  });
});
