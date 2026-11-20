import type { TranscriptDocument } from "@verbal/core";

/** Padding added around each removed word so cuts do not clip consonants. */
export const DEFAULT_HANDLE_SECONDS = 0.05;

/** Kept fragments shorter than this are folded into the surrounding cut. */
export const DEFAULT_MIN_KEEP_GAP_SECONDS = 0.02;

const PRECISION = 1_000_000;

/** Rounds to microseconds so floating-point noise cannot make output drift. */
function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

export type CutRange = {
  /** Seconds from the start of the source media. */
  start: number;
  end: number;
};

export type CutList = {
  durationSeconds: number;
  kept: CutRange[];
  removed: CutRange[];
  keptDurationSeconds: number;
};

export type CutListErrorCode = "invalid-duration" | "invalid-option";

/** Error raised when cut-list inputs are unusable. */
export class CutListError extends Error {
  readonly code: CutListErrorCode;

  constructor(code: CutListErrorCode, message: string) {
    super(message);
    this.name = "CutListError";
    this.code = code;
  }
}

export type BuildCutListInput = {
  transcript: TranscriptDocument;
  /** Total length of the source media, in seconds. */
  durationSeconds: number;
  handleSeconds?: number;
  minKeepGapSeconds?: number;
};

function mergeIntervals(intervals: CutRange[]): CutRange[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: CutRange[] = [];

  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && interval.start <= last.end + 1e-9) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ start: interval.start, end: interval.end });
    }
  }

  return merged;
}

/** Complement of `kept` over `[0, duration)`. */
function complement(kept: CutRange[], duration: number): CutRange[] {
  const removed: CutRange[] = [];
  let cursor = 0;

  for (const range of kept) {
    if (range.start > cursor) {
      removed.push({ start: cursor, end: range.start });
    }
    cursor = range.end;
  }

  if (cursor < duration) {
    removed.push({ start: cursor, end: duration });
  }

  return removed;
}

/**
 * Derives the export cut list from the transcript's removals.
 *
 * Pure: identical inputs produce identical output, and every timestamp is
 * rounded so repeated serialisation is byte-stable.
 */
export function buildCutList(input: BuildCutListInput): CutList {
  const duration = input.durationSeconds;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new CutListError("invalid-duration", "duration must be a positive number");
  }

  const handle = input.handleSeconds ?? DEFAULT_HANDLE_SECONDS;
  if (!Number.isFinite(handle) || handle < 0) {
    throw new CutListError("invalid-option", "handleSeconds must not be negative");
  }

  const minKeepGap = input.minKeepGapSeconds ?? DEFAULT_MIN_KEEP_GAP_SECONDS;
  if (!Number.isFinite(minKeepGap) || minKeepGap < 0) {
    throw new CutListError("invalid-option", "minKeepGapSeconds must not be negative");
  }

  const removedIds = new Set(input.transcript.removedWordIds);

  // With no speech left, the inter-word silences are dead air too: the honest
  // result is an empty timeline, not a series of lonely gaps.
  const allRemoved =
    input.transcript.words.length > 0 &&
    input.transcript.words.every((word) => removedIds.has(word.id));

  if (allRemoved) {
    return {
      durationSeconds: round(duration),
      kept: [],
      removed: [{ start: 0, end: round(duration) }],
      keptDurationSeconds: 0,
    };
  }

  const intervals: CutRange[] = [];

  for (const word of input.transcript.words) {
    if (!removedIds.has(word.id)) {
      continue;
    }

    const start = round(Math.max(0, word.start - handle));
    const end = round(Math.min(duration, word.end + handle));

    if (end > start) {
      intervals.push({ start, end });
    }
  }

  const merged = mergeIntervals(intervals);

  if (merged.length === 0) {
    return {
      durationSeconds: round(duration),
      kept: [{ start: 0, end: round(duration) }],
      removed: [],
      keptDurationSeconds: round(duration),
    };
  }

  const kept: CutRange[] = [];
  let cursor = 0;

  for (const interval of merged) {
    if (interval.start > cursor) {
      kept.push({ start: round(cursor), end: round(interval.start) });
    }
    cursor = Math.max(cursor, interval.end);
  }

  if (cursor < duration) {
    kept.push({ start: round(cursor), end: round(duration) });
  }

  // Drop fragments too short to be useful; the gap then joins the surrounding
  // cut rather than surviving as a stray sliver.
  const useful = kept.filter((range) => range.end - range.start > minKeepGap);

  const keptDurationSeconds = round(
    useful.reduce((total, range) => total + (range.end - range.start), 0),
  );

  return {
    durationSeconds: round(duration),
    kept: useful,
    removed: complement(useful, round(duration)),
    keptDurationSeconds,
  };
}

/** Serialises a cut list with a stable, diff-friendly layout. */
export function serializeCutList(cutList: CutList): string {
  return `${JSON.stringify(cutList, null, 2)}\n`;
}
