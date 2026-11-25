import type { TranscriptDocument } from "@verbal/core";
import { buildCutList, DEFAULT_HANDLE_SECONDS } from "@verbal/media";
import { StoryboardError } from "@verbal/storyboard";

/** Kept fragments shorter than this are dropped from the result. */
const MIN_TALK_SECONDS = 0.05;

const EPSILON = 1e-6;
const PRECISION = 1_000_000;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

/** An item of a talk scene's export timeline, in transcript order. */
export type TalkItem =
  | { kind: "video"; startSeconds: number; endSeconds: number }
  | { kind: "silence"; durationSeconds: number };

export type TalkItemsInput = {
  transcript: TranscriptDocument;
  startWordId: string;
  endWordId: string;
};

/** True when a word other than the two neighbours lies wholly inside a gap. */
function hasWordInside(
  gapStart: number,
  gapEnd: number,
  words: TranscriptDocument["words"],
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

/**
 * Builds the export timeline of one talk scene.
 *
 * Word times stay in source seconds. Only an explicit silence entry adds air;
 * a time gap between words is never treated as silence. A forward gap with no
 * word inside it is a natural pause and stays inside the video range.
 */
export function computeTalkItems(input: TalkItemsInput): TalkItem[] {
  const words = input.transcript.words;
  const from = words.findIndex((word) => word.id === input.startWordId);
  const to = words.findIndex((word) => word.id === input.endWordId);
  const anchors = `${input.startWordId}..${input.endWordId}`;

  if (from === -1 || to === -1) {
    throw new StoryboardError("unknown-anchor", `unknown anchor: ${anchors}`);
  }
  if (to < from) {
    throw new StoryboardError("invalid-anchor", `reversed anchor: ${anchors}`);
  }

  const removed = new Set(input.transcript.removedWordIds);
  const silences = new Map(
    (input.transcript.silences ?? []).map((entry) => [entry.afterWordId, entry.seconds]),
  );
  const items: TalkItem[] = [];
  let current: { start: number; end: number } | undefined;
  let afterRemoval = 0;
  let removalStart = Number.POSITIVE_INFINITY;
  let previousKept: string | undefined;

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

  for (const word of words.slice(from, to + 1)) {
    if (removed.has(word.id)) {
      if (current !== undefined && word.start >= current.start - EPSILON) {
        removalStart = Math.min(
          removalStart,
          Math.max(current.start, word.start - DEFAULT_HANDLE_SECONDS),
        );
        current.end = Math.max(current.start, removalStart);
      }
      afterRemoval = Math.max(afterRemoval, word.end + DEFAULT_HANDLE_SECONDS);
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
        const excluded = new Set([previousKept, word.id].filter((id): id is string => id !== undefined));
        const split =
          start < current.end - EPSILON || hasWordInside(current.end, start, words, excluded);
        if (split) {
          flush();
          current = { start, end: word.end };
        } else {
          current.end = Math.max(current.end, word.end);
        }
      }
      previousKept = word.id;
    }

    const seconds = silences.get(word.id);
    if (seconds !== undefined) {
      flush();
      items.push({ kind: "silence", durationSeconds: round(seconds) });
    }
  }

  flush();
  return items;
}

export type TalkRange = {
  startSeconds: number;
  endSeconds: number;
};

export type TalkRangeInput = {
  startSeconds: number;
  endSeconds: number;
  transcript: TranscriptDocument;
};

/**
 * Computes the kept source ranges of one talk scene.
 *
 * Removals come from the transcript. Each kept range is clipped to the scene
 * and fragments too short to use are dropped.
 */
export function computeTalkRanges(input: TalkRangeInput): TalkRange[] {
  const lastWordEnd = input.transcript.words.reduce(
    (latest, word) => Math.max(latest, word.end),
    0,
  );
  const cutList = buildCutList({
    transcript: input.transcript,
    durationSeconds: Math.max(input.endSeconds, lastWordEnd),
  });

  const ranges: TalkRange[] = [];
  for (const kept of cutList.kept) {
    const startSeconds = Math.max(kept.start, input.startSeconds);
    const endSeconds = Math.min(kept.end, input.endSeconds);
    if (endSeconds - startSeconds >= MIN_TALK_SECONDS) {
      ranges.push({ startSeconds, endSeconds });
    }
  }
  return ranges;
}
