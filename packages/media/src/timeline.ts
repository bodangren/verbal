import type { TranscriptDocument, TranscriptWord } from "@verbal/core";
import { buildCutList, DEFAULT_HANDLE_SECONDS } from "./cutlist";

/** A kept source-video range, in source seconds. */
export type TimelineVideo = {
  kind: "video";
  startSeconds: number;
  endSeconds: number;
};

/** Inserted air, rendered as black video and silent audio. */
export type TimelineSilence = {
  kind: "silence";
  durationSeconds: number;
};

/** One piece of the ordered export timeline. */
export type TimelineItem = TimelineVideo | TimelineSilence;

export type BuildTimelineInput = {
  transcript: TranscriptDocument;
  handleSeconds?: number;
  /** Media length; when given, the kept head and tail reach the media edges. */
  durationSeconds?: number;
};

const EPSILON = 1e-6;
const PRECISION = 1_000_000;

/** Video ranges shorter than this are unusable and dropped. */
const MIN_VIDEO_SECONDS = 0.001;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

/** True when a word other than the two neighbours lies wholly inside a gap. */
function hasWordInside(
  gapStart: number,
  gapEnd: number,
  words: readonly TranscriptWord[],
  excluded: ReadonlySet<string>,
): boolean {
  return words.some(
    (word) =>
      !excluded.has(word.id) &&
      word.start >= gapStart - EPSILON &&
      word.end <= gapEnd + EPSILON &&
      word.end > word.start,
  );
}

/** True when a moved word now starts earlier than the word before it. */
function isReordered(words: readonly TranscriptWord[]): boolean {
  let previousStart = Number.NEGATIVE_INFINITY;
  for (const word of words) {
    if (word.start < previousStart) {
      return true;
    }
    previousStart = word.start;
  }
  return false;
}

/**
 * Builds the ordered export timeline of a transcript.
 *
 * Word times stay in source seconds. Only an explicit silence entry adds air;
 * a time gap between words is never treated as silence. A forward gap with no
 * word inside it is a natural pause and stays inside the video range.
 */
export function buildTimeline(input: BuildTimelineInput): TimelineItem[] {
  const handleSeconds = input.handleSeconds ?? DEFAULT_HANDLE_SECONDS;
  const words = input.transcript.words;
  const durationSeconds = input.durationSeconds;
  const hasSilences = (input.transcript.silences ?? []).length > 0;

  const durationGiven =
    durationSeconds !== undefined &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0;

  // With no reorder and no inserted silence the timeline is a plain cut: keep
  // every source second outside a removed word plus its handle, matching the
  // deletion-only planner exactly (head, tail, gaps and the empty transcript).
  if (durationGiven && !hasSilences && !isReordered(words)) {
    return buildCutList({
      transcript: input.transcript,
      durationSeconds,
      handleSeconds,
    }).kept.map((range) => ({
      kind: "video",
      startSeconds: range.start,
      endSeconds: range.end,
    }));
  }

  const removed = new Set(input.transcript.removedWordIds);
  const silences = new Map(
    (input.transcript.silences ?? []).map((entry) => [entry.afterWordId, entry.seconds]),
  );
  const items: TimelineItem[] = [];
  let current: { start: number; end: number } | undefined;
  let afterRemoval = 0;
  let removalStart = Number.POSITIVE_INFINITY;
  let previousKeptWord: TranscriptWord | undefined;

  const flush = () => {
    if (current !== undefined) {
      items.push({
        kind: "video",
        startSeconds: round(current.start),
        endSeconds: round(current.end),
      });
      current = undefined;
    }
  };

  for (const word of words) {
    if (removed.has(word.id)) {
      if (current !== undefined && word.start >= current.start - EPSILON) {
        removalStart = Math.min(
          removalStart,
          Math.max(current.start, word.start - handleSeconds),
        );
        current.end = Math.max(current.start, removalStart);
      }
      afterRemoval = Math.max(afterRemoval, word.end + handleSeconds);
    } else {
      const start =
        afterRemoval > 0 && (current === undefined || afterRemoval >= current.end - EPSILON)
          ? afterRemoval
          : word.start;
      afterRemoval = 0;
      removalStart = Number.POSITIVE_INFINITY;

      if (current === undefined) {
        current = { start, end: word.end };
      } else {
        const excluded = new Set(
          [previousKeptWord?.id, word.id].filter((id): id is string => id !== undefined),
        );
        const reordered =
          previousKeptWord !== undefined &&
          (start < previousKeptWord.start - EPSILON ||
            (Math.abs(start - previousKeptWord.start) <= EPSILON &&
              word.end < previousKeptWord.end - EPSILON));
        const overlaps = start < current.end - EPSILON;
        const split =
          (overlaps && reordered) || hasWordInside(current.end, start, words, excluded);
        if (split) {
          flush();
          current = { start, end: word.end };
        } else {
          current.end = Math.max(current.end, word.end);
        }
      }
      previousKeptWord = word;
    }

    const seconds = silences.get(word.id);
    if (seconds !== undefined) {
      flush();
      items.push({ kind: "silence", durationSeconds: round(seconds) });
    }
  }

  flush();

  const extendEdges =
    durationSeconds !== undefined &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    !isReordered(words);

  if (extendEdges) {
    const firstWord = words[0];
    if (firstWord !== undefined && !removed.has(firstWord.id)) {
      const first = items[0];
      if (first !== undefined && first.kind === "video") {
        first.startSeconds = 0;
      }
    }

    const lastWord = words[words.length - 1];
    if (lastWord !== undefined && !removed.has(lastWord.id)) {
      const last = items[items.length - 1];
      if (last !== undefined && last.kind === "video") {
        last.endSeconds = round(durationSeconds);
      }
    }
  }

  // A collapse can still survive the loop: a removed word truncates its
  // neighbour to zero, or a kept word lies inside a removed handle. Drop any
  // item that is empty, reversed or shorter than the minimum before it joins
  // the timeline. Adjacent items that touch are not merged here, so a silence
  // or a reorder boundary stays put.
  return items.filter((item) =>
    item.kind === "video"
      ? item.endSeconds > item.startSeconds + MIN_VIDEO_SECONDS
      : item.durationSeconds > 0,
  );
}
