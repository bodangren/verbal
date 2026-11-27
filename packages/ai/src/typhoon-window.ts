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

type AbsoluteWord = {
  text: string;
  start: number;
  end: number;
  windowIndex: number;
};

function byStart(a: AbsoluteWord, b: AbsoluteWord): number {
  return a.start - b.start || a.end - b.end || a.windowIndex - b.windowIndex;
}

/** Turns a second offset into integer microseconds, to sum without float drift. */
function toMicros(seconds: number): number {
  return Math.round(seconds * 1_000_000);
}

/**
 * Aligns two overlap word lists as ordered sequences.
 *
 * A longest-common-subsequence dynamic program pairs words with equal
 * normalised text whose starts sit within the match tolerance, so pairs never
 * cross. It maximises the number of matched pairs first and minimises the
 * summed start difference second. Unmatched words are left for the caller.
 */
function alignOverlapWords(
  leftWords: readonly AbsoluteWord[],
  rightWords: readonly AbsoluteWord[],
): Array<{ left: AbsoluteWord; right: AbsoluteWord }> {
  const n = leftWords.length;
  const m = rightWords.length;

  const count: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const distance: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= m; j += 1) {
      if (i === 0 || j === 0) {
        continue;
      }
      let bestCount = count[i - 1]![j]!;
      let bestDistance = distance[i - 1]![j]!;
      if (
        count[i]![j - 1]! > bestCount ||
        (count[i]![j - 1]! === bestCount && distance[i]![j - 1]! < bestDistance)
      ) {
        bestCount = count[i]![j - 1]!;
        bestDistance = distance[i]![j - 1]!;
      }
      const left = leftWords[i - 1]!;
      const right = rightWords[j - 1]!;
      const separation = Math.abs(left.start - right.start);
      if (
        normalizeText(left.text) === normalizeText(right.text) &&
        separation <= MATCH_TOLERANCE_SECONDS
      ) {
        const matchCount = count[i - 1]![j - 1]! + 1;
        const matchDistance = distance[i - 1]![j - 1]! + toMicros(separation);
        if (matchCount > bestCount || (matchCount === bestCount && matchDistance < bestDistance)) {
          bestCount = matchCount;
          bestDistance = matchDistance;
        }
      }
      count[i]![j] = bestCount;
      distance[i]![j] = bestDistance;
    }
  }

  const pairs: Array<{ left: AbsoluteWord; right: AbsoluteWord }> = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const left = leftWords[i - 1]!;
    const right = rightWords[j - 1]!;
    const separation = Math.abs(left.start - right.start);
    const canMatch =
      normalizeText(left.text) === normalizeText(right.text) &&
      separation <= MATCH_TOLERANCE_SECONDS;
    if (
      canMatch &&
      count[i]![j]! === count[i - 1]![j - 1]! + 1 &&
      distance[i]![j]! === distance[i - 1]![j - 1]! + toMicros(separation)
    ) {
      pairs.push({ left, right });
      i -= 1;
      j -= 1;
    } else if (count[i]![j]! === count[i - 1]![j]! && distance[i]![j]! === distance[i - 1]![j]!) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  pairs.reverse();
  return pairs;
}

/**
 * Merges per-window word lists into one list with absolute times.
 *
 * Each word's start and end are relative to its window, so the window start is
 * added. Across a seam, a word whose start lies within the match tolerance of
 * the overlap counts as an overlap word. The two overlap lists are aligned as
 * ordered sequences: pairs share normalised text, sit within the tolerance,
 * and never cross. A matched pair keeps the copy whose midpoint is farther
 * from its own window's edge, so the copy with more context wins. An unmatched
 * word is kept, so no word is lost and none is duplicated.
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
    const leftWords = absolute[k]!
      .filter((word) => word.start >= overlapStart && word.start <= overlapEnd)
      .sort(byStart);
    const rightWords = absolute[k + 1]!
      .filter((word) => word.start >= overlapStart && word.start <= overlapEnd)
      .sort(byStart);

    for (const pair of alignOverlapWords(leftWords, rightWords)) {
      const leftMidpoint = (pair.left.start + pair.left.end) / 2;
      const rightMidpoint = (pair.right.start + pair.right.end) / 2;
      const leftContext = leftEnd - leftMidpoint;
      const rightContext = rightMidpoint - rightStart;
      if (rightContext > leftContext) {
        dropped.add(pair.left);
      } else {
        dropped.add(pair.right);
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
