import type { TranscriptDocument } from "@verbal/core";
import {
  buildCutList,
  buildTimeline,
  type TimelineItem,
} from "@verbal/media";
import { StoryboardError } from "@verbal/storyboard";

/** Kept fragments shorter than this are dropped from the result. */
const MIN_TALK_SECONDS = 0.05;

/** An item of a talk scene's export timeline, in transcript order. */
export type TalkItem = TimelineItem;

export type TalkItemsInput = {
  transcript: TranscriptDocument;
  startWordId: string;
  endWordId: string;
};

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

  return buildTimeline({
    transcript: { ...input.transcript, words: words.slice(from, to + 1) },
  });
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
