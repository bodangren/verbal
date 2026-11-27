/**
 * Windowing helpers for Typhoon ASR Realtime.
 *
 * The engine reads a whole WAV and computes every mel frame in one pass, so a
 * long take holds an unbounded amount of features in memory. The provider
 * instead slices the audio into bounded, overlapping windows, transcribes each
 * one, and merges the word lists here. Every function is pure.
 */
import type { SpokenWord } from "./types";

export type WindowPlan = {
  index: number;
  startSample: number;
  endSample: number;
  startSeconds: number;
};

export type WindowOptions = {
  windowSeconds?: number;
  overlapSeconds?: number;
};

const DEFAULT_WINDOW_SECONDS = 30;
const DEFAULT_OVERLAP_SECONDS = 1;

/**
 * Splits a signal into fixed windows that cover it with no gap.
 *
 * Each window after the first starts one step after the previous one, where
 * the step is the window length minus the overlap. The last window clamps to
 * the signal end, so it may be shorter. A signal shorter than one window gives
 * one window, and an empty signal gives no window.
 */
export function planWindows(
  totalSamples: number,
  sampleRate: number,
  options: WindowOptions = {},
): WindowPlan[] {
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const overlapSeconds = options.overlapSeconds ?? DEFAULT_OVERLAP_SECONDS;

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error(`sample rate must be positive, got ${sampleRate}`);
  }
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new Error(`windowSeconds must be positive, got ${windowSeconds}`);
  }
  if (overlapSeconds < 0) {
    throw new Error(`overlapSeconds must not be negative, got ${overlapSeconds}`);
  }
  if (windowSeconds <= overlapSeconds) {
    throw new Error(`overlapSeconds (${overlapSeconds}) must be less than windowSeconds (${windowSeconds})`);
  }
  if (totalSamples <= 0) {
    return [];
  }

  const windowSamples = Math.round(windowSeconds * sampleRate);
  const overlapSamples = Math.round(overlapSeconds * sampleRate);
  const stepSamples = windowSamples - overlapSamples;
  if (stepSamples <= 0) {
    throw new Error("the window is too short for one step");
  }

  const windows: WindowPlan[] = [];
  let index = 0;
  let startSample = 0;
  while (startSample < totalSamples) {
    const endSample = Math.min(startSample + windowSamples, totalSamples);
    windows.push({
      index,
      startSample,
      endSample,
      startSeconds: startSample / sampleRate,
    });
    index += 1;
    startSample += stepSamples;
  }
  return windows;
}

/**
 * Merges per-window word lists into one list with absolute times.
 *
 * Each word's start and end are relative to its window, so the window start is
 * added. A word spoken inside the overlap appears in two windows. Its midpoint
 * falls on only one side of the overlap's middle, so each copy is kept by
 * exactly one window: the earlier copy wins before the middle, the later copy
 * wins after it. The result stays in order with no duplicate.
 */
export function mergeWindowResults(
  windows: readonly WindowPlan[],
  results: readonly (readonly SpokenWord[])[],
): SpokenWord[] {
  const merged: SpokenWord[] = [];
  if (windows.length === 0) {
    return merged;
  }

  // Recover the sample rate from the uniform window spacing, to turn sample
  // offsets into seconds for the overlap midpoints.
  const sampleRate =
    windows.length > 1
      ? (windows[1]!.startSample - windows[0]!.startSample) /
        (windows[1]!.startSeconds - windows[0]!.startSeconds)
      : 1;

  for (let k = 0; k < windows.length; k += 1) {
    const window = windows[k]!;
    const endSeconds = window.endSample / sampleRate;

    const leftBoundary =
      k === 0
        ? Number.NEGATIVE_INFINITY
        : (window.startSeconds + windows[k - 1]!.endSample / sampleRate) / 2;
    const rightBoundary =
      k === windows.length - 1
        ? Number.POSITIVE_INFINITY
        : (windows[k + 1]!.startSeconds + endSeconds) / 2;

    for (const word of results[k] ?? []) {
      const start = window.startSeconds + word.start;
      const end = window.startSeconds + word.end;
      const midpoint = (start + end) / 2;
      if (midpoint >= leftBoundary && midpoint < rightBoundary) {
        merged.push({ text: word.text, start: round(start), end: round(end) });
      }
    }
  }

  return merged;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
