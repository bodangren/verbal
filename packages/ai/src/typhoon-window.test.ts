import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractFeatures } from "./typhoon-features";
import { mergeWindowResults, planWindows } from "./typhoon-window";
import type { SpokenWord } from "./types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "..", "testdata", "typhoon");

function sineSignal(sampleRate: number, seconds: number): Float32Array {
  const samples = Math.round(sampleRate * seconds);
  const signal = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    signal[i] = 0.5 * Math.sin(2 * Math.PI * 440 * t) + 0.2 * Math.sin(2 * Math.PI * 1000 * t);
  }
  return signal;
}

function readFixtureFeatures(): Float32Array {
  const bytes = readFileSync(path.join(FIXTURE, "features-sine.f32"));
  const features = new Float32Array(bytes.length / 4);
  for (let i = 0; i < features.length; i += 1) {
    features[i] = bytes.readFloatLE(i * 4);
  }
  return features;
}

/** A deterministic offset in [-0.1, 0.1] s per (word, window). */
function jitter(wordIndex: number, windowIndex: number): number {
  const x = Math.sin((wordIndex + 1) * 12.9898 + (windowIndex + 1) * 78.233) * 43758.5453;
  const fraction = x - Math.floor(x);
  return (fraction - 0.5) * 0.2;
}

describe("planWindows", () => {
  it("covers a 95 s signal with 30 s windows and a 1 s overlap, no gap, last window the remainder", () => {
    const sampleRate = 16000;
    const windows = planWindows(sampleRate * 95, sampleRate);

    expect(windows).toEqual([
      { index: 0, startSample: 0, endSample: 480000, startSeconds: 0 },
      { index: 1, startSample: 464000, endSample: 944000, startSeconds: 29 },
      { index: 2, startSample: 928000, endSample: 1408000, startSeconds: 58 },
      { index: 3, startSample: 1392000, endSample: 1520000, startSeconds: 87 },
    ]);

    // No gap: each window starts before the previous one ends.
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i]!.startSample).toBeLessThan(windows[i - 1]!.endSample);
    }
    // The last window is the remainder: shorter than one full window.
    const last = windows.at(-1)!;
    expect(last.endSample - last.startSample).toBeLessThan(480000);
  });

  it("gives one window for a signal shorter than one window", () => {
    expect(planWindows(16000 * 10, 16000)).toEqual([
      { index: 0, startSample: 0, endSample: 160000, startSeconds: 0 },
    ]);
  });

  it("gives no window for an empty signal", () => {
    expect(planWindows(0, 16000)).toEqual([]);
  });

  it("plans no trailing window that adds no new samples", () => {
    const sampleRate = 16000;
    expect(planWindows(sampleRate * 30, sampleRate)).toEqual([
      { index: 0, startSample: 0, endSample: 480000, startSeconds: 0 },
    ]);
    expect(planWindows(sampleRate * 59, sampleRate)).toEqual([
      { index: 0, startSample: 0, endSample: 480000, startSeconds: 0 },
      { index: 1, startSample: 464000, endSample: 944000, startSeconds: 29 },
    ]);
    expect(planWindows(sampleRate * 60, sampleRate)).toEqual([
      { index: 0, startSample: 0, endSample: 480000, startSeconds: 0 },
      { index: 1, startSample: 464000, endSample: 944000, startSeconds: 29 },
      { index: 2, startSample: 928000, endSample: 960000, startSeconds: 58 },
    ]);
    expect(planWindows(sampleRate * 61, sampleRate)).toEqual([
      { index: 0, startSample: 0, endSample: 480000, startSeconds: 0 },
      { index: 1, startSample: 464000, endSample: 944000, startSeconds: 29 },
      { index: 2, startSample: 928000, endSample: 976000, startSeconds: 58 },
    ]);
    expect(planWindows(sampleRate * 90, sampleRate)).toEqual([
      { index: 0, startSample: 0, endSample: 480000, startSeconds: 0 },
      { index: 1, startSample: 464000, endSample: 944000, startSeconds: 29 },
      { index: 2, startSample: 928000, endSample: 1408000, startSeconds: 58 },
      { index: 3, startSample: 1392000, endSample: 1440000, startSeconds: 87 },
    ]);
  });
});

describe("mergeWindowResults", () => {
  const WINDOWS = [
    { index: 0, startSample: 0, endSample: 480000, startSeconds: 0 },
    { index: 1, startSample: 464000, endSample: 944000, startSeconds: 29 },
  ];

  it("merges words with absolute times and drops the duplicate in the overlap", () => {
    const results = [
      [
        { text: "hello", start: 28, end: 28.8 },
        { text: "world", start: 29, end: 29.6 },
      ],
      [
        { text: "world", start: 0.1, end: 0.7 },
        { text: "again", start: 1, end: 2 },
      ],
    ];

    expect(mergeWindowResults(WINDOWS, results)).toEqual([
      { text: "hello", start: 28, end: 28.8 },
      { text: "world", start: 29, end: 29.6 },
      { text: "again", start: 30, end: 31 },
    ]);
  });

  it("keeps the later window's copy past the middle of the overlap", () => {
    const results = [
      [{ text: "y", start: 29.3, end: 30.2 }],
      [{ text: "y", start: 0.3, end: 1.2 }],
    ];

    expect(mergeWindowResults(WINDOWS, results)).toEqual([
      { text: "y", start: 29.3, end: 30.2 },
    ]);
  });

  it("returns an empty list for no windows", () => {
    expect(mergeWindowResults([], [])).toEqual([]);
  });

  it("keeps one copy when both windows report the word 0.2 s apart", () => {
    const results = [
      [{ text: "Hello", start: 29.1, end: 29.5 }],
      [{ text: "hello", start: 0.3, end: 0.7 }],
    ];

    expect(mergeWindowResults(WINDOWS, results)).toEqual([
      { text: "Hello", start: 29.1, end: 29.5 },
    ]);
  });

  it("keeps a repeated word 0.5 s apart in the overlap twice", () => {
    const results = [
      [{ text: "no", start: 29.4, end: 29.8 }],
      [{ text: "no", start: 0.9, end: 1.3 }],
    ];

    expect(mergeWindowResults(WINDOWS, results)).toEqual([
      { text: "no", start: 29.4, end: 29.8 },
      { text: "no", start: 29.9, end: 30.3 },
    ]);
  });

  it("keeps a word seen only by the later window near the seam", () => {
    const results = [
      [],
      [{ text: "late", start: 0.1, end: 0.5 }],
    ];

    expect(mergeWindowResults(WINDOWS, results)).toEqual([
      { text: "late", start: 29.1, end: 29.5 },
    ]);
  });

  it("keeps a word seen only by the earlier window near the seam", () => {
    const results = [
      [{ text: "early", start: 29.6, end: 30.0 }],
      [],
    ];

    expect(mergeWindowResults(WINDOWS, results)).toEqual([
      { text: "early", start: 29.6, end: 30.0 },
    ]);
  });

  it("merges a 90 s transcript with jittered overlaps to one copy per word", () => {
    const sampleRate = 16000;
    const seconds = 90;
    const windows = planWindows(sampleRate * seconds, sampleRate);
    expect(windows.length).toBeGreaterThan(2);

    const trueStart = new Map<string, number>();
    const results: SpokenWord[][] = windows.map(() => []);
    let wordIndex = 0;
    for (let t = 0.25; t < seconds; t += 0.5) {
      const text = `w${wordIndex}`;
      trueStart.set(text, t);
      wordIndex += 1;
      for (let k = 0; k < windows.length; k += 1) {
        const window = windows[k]!;
        const startSeconds = window.startSeconds;
        const endSeconds = window.endSample / sampleRate;
        if (t >= startSeconds && t <= endSeconds) {
          const start = t - startSeconds + jitter(wordIndex - 1, k);
          results[k]!.push({ text, start, end: start + 0.4 });
        }
      }
    }

    const merged = mergeWindowResults(windows, results);

    expect(merged).toHaveLength(trueStart.size);
    for (let i = 0; i < merged.length; i += 1) {
      const word = merged[i]!;
      const expected = trueStart.get(word.text);
      expect(expected).toBeDefined();
      expect(Math.abs(word.start - expected!)).toBeLessThanOrEqual(0.2);
    }
    for (let i = 1; i < merged.length; i += 1) {
      expect(merged[i]!.start).toBeGreaterThanOrEqual(merged[i - 1]!.start);
    }
  });
});

describe("window features", () => {
  it("matches the one-shot features on the sine fixture", () => {
    const reference = readFixtureFeatures();
    const signal = sineSignal(16000, 1);
    const windows = planWindows(signal.length, 16000);

    expect(windows).toHaveLength(1);
    const windowed = extractFeatures(
      signal.subarray(windows[0]!.startSample, windows[0]!.endSample),
    );

    expect(windowed.data.length).toBe(reference.length);
    let maxDiff = 0;
    for (let i = 0; i < reference.length; i += 1) {
      maxDiff = Math.max(maxDiff, Math.abs(windowed.data[i]! - reference[i]!));
    }
    expect(maxDiff).toBeLessThan(2e-4);
  });
});
