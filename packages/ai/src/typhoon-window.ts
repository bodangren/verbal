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
/** A seam word reported closer than this in two windows is the same word. */
const MATCH_TOLERANCE_SECONDS = 0.3;

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
    if (endSample >= totalSamples) {
      break;
    }
    index += 1;
    startSample += stepSamples;
  }
  return windows;
}

/**
 * Merges per-window word lists into one list with absolute times.
 *
 * Each word's start and end are relative to its window, so the window start is
 * added. Across a seam, a word whose start lies within the match tolerance of
 * the overlap counts as an overlap word. Overlap words are matched by
 * normalised text, then by the smallest absolute start difference, greedily by
 * increasing distance, each word matched at most once. A matched pair keeps the
 * copy whose midpoint is farther from its own window's edge, so the copy with
 * more context wins. An unmatched word is kept, so no word is lost and none is
 * duplicated.
 */
export function mergeWindowResults(
  windows: readonly WindowPlan[],
  results: readonly (readonly SpokenWord[])[],
): SpokenWord[] {
  if (windows.length === 0) {
    return [];
  }

  // Recover the sample rate from the uniform window spacing, to turn sample
  // offsets into seconds for the overlap boundaries.
  const sampleRate =
    windows.length > 1
      ? (windows[1]!.startSample - windows[0]!.startSample) /
        (windows[1]!.startSeconds - windows[0]!.startSeconds)
      : 1;

  type AbsoluteWord = {
    text: string;
    start: number;
    end: number;
    windowIndex: number;
  };

  const absolute: AbsoluteWord[][] = windows.map((window, k) =>
    (results[k] ?? []).map((word) => ({
      text: word.text,
      start: window.startSeconds + word.start,
      end: window.startSeconds + word.end,
      windowIndex: k,
    })),
  );

  const dropped = new Set<AbsoluteWord>();

  for (let k = 0; k < windows.length - 1; k += 1) {
    const leftEnd = windows[k]!.endSample / sampleRate;
    const rightStart = windows[k + 1]!.startSeconds;
    const overlapStart = rightStart - MATCH_TOLERANCE_SECONDS;
    const overlapEnd = leftEnd + MATCH_TOLERANCE_SECONDS;
    const leftWords = absolute[k]!.filter(
      (word) => word.start >= overlapStart && word.start <= overlapEnd,
    );
    const rightWords = absolute[k + 1]!.filter(
      (word) => word.start >= overlapStart && word.start <= overlapEnd,
    );

    type Candidate = { left: AbsoluteWord; right: AbsoluteWord; distance: number };
    const candidates: Candidate[] = [];
    for (const left of leftWords) {
      for (const right of rightWords) {
        if (normalizeText(left.text) !== normalizeText(right.text)) {
          continue;
        }
        const distance = Math.abs(left.start - right.start);
        if (distance > MATCH_TOLERANCE_SECONDS) {
          continue;
        }
        candidates.push({ left, right, distance });
      }
    }

    candidates.sort(
      (a, b) =>
        a.distance - b.distance ||
        a.left.start - b.left.start ||
        a.right.start - b.right.start,
    );

    const matchedLeft = new Set<AbsoluteWord>();
    const matchedRight = new Set<AbsoluteWord>();
    for (const candidate of candidates) {
      if (matchedLeft.has(candidate.left) || matchedRight.has(candidate.right)) {
        continue;
      }
      matchedLeft.add(candidate.left);
      matchedRight.add(candidate.right);
      const leftMidpoint = (candidate.left.start + candidate.left.end) / 2;
      const rightMidpoint = (candidate.right.start + candidate.right.end) / 2;
      const leftContext = leftEnd - leftMidpoint;
      const rightContext = rightMidpoint - rightStart;
      if (rightContext > leftContext) {
        dropped.add(candidate.left);
      } else {
        dropped.add(candidate.right);
      }
    }
  }

  const kept = absolute.flat().filter((word) => !dropped.has(word));
  kept.sort((a, b) => a.start - b.start || a.end - b.end || a.windowIndex - b.windowIndex);

  return kept.map((word) => ({ text: word.text, start: round(word.start), end: round(word.end) }));
}

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
