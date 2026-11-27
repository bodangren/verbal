import { createHash } from "node:crypto";
import type { TranscriptDocument, TranscriptWord } from "@verbal/core";
import {
  buildTimeline,
  CutListError,
  type CutList,
  type CutRange,
  type TimelineItem,
  type TimelineVideo,
} from "@verbal/media";
import { canonicalJson } from "@verbal/storyboard/hash";
import type { CleanupProposal } from "./types";

export type AnchorEntry = {
  id: string;
  /** Seconds in the cleaned master, not the source. */
  start: number;
  end: number;
};

export type FrozenMaster = {
  removedWordIds: string[];
  cutList: CutList;
  anchorWords: AnchorEntry[];
  masterDurationSeconds: number;
  /** Identifies the exact cut; a storyboard anchored to a different one must re-anchor. */
  fingerprint: string;
  /** True when the timeline has no silence and no reorder, so the legacy fingerprint can match. */
  legacyEligible: boolean;
};

const FINGERPRINT_VERSION = 2;
const PRECISION = 1_000_000;
const EPSILON = 1e-9;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

function isVideo(item: TimelineItem): item is TimelineVideo {
  return item.kind === "video";
}

/** True when a word now starts earlier than the word before it. */
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

/** The kept source ranges, in output order. */
function keptRanges(items: readonly TimelineItem[]): CutRange[] {
  return items.filter(isVideo).map((item) => ({ start: item.startSeconds, end: item.endSeconds }));
}

/** Source seconds not kept, as the complement of the kept ranges over `[0, duration)`. */
function removedRanges(kept: readonly CutRange[], duration: number): CutRange[] {
  const sorted = [...kept].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: CutRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && range.start <= last.end + EPSILON) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }

  const removed: CutRange[] = [];
  let cursor = 0;

  for (const range of merged) {
    if (range.start > cursor) {
      removed.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  }

  if (cursor < duration) {
    removed.push({ start: cursor, end: duration });
  }

  return removed;
}

/**
 * Maps surviving words to master time by walking the ordered timeline.
 *
 * Each video item keeps one source range; silence items advance the master
 * offset without carrying any word. Words are matched by their source start,
 * so the anchors land in output order even after a reorder.
 */
function mapTimelineAnchors(
  words: readonly TranscriptWord[],
  removed: ReadonlySet<string>,
  items: readonly TimelineItem[],
): AnchorEntry[] {
  const anchors: AnchorEntry[] = [];
  const mapped = new Set<string>();
  let offset = 0;

  for (const item of items) {
    if (item.kind === "silence") {
      offset += item.durationSeconds;
      continue;
    }

    const rangeStart = item.startSeconds;
    const rangeEnd = item.endSeconds;
    const length = rangeEnd - rangeStart;

    for (const word of words) {
      if (removed.has(word.id) || mapped.has(word.id)) {
        continue;
      }
      if (word.start < rangeStart - EPSILON || word.start >= rangeEnd - EPSILON) {
        continue;
      }

      anchors.push({
        id: word.id,
        start: round(offset + Math.max(0, word.start - rangeStart)),
        end: round(offset + Math.min(length, word.end - rangeStart)),
      });
      mapped.add(word.id);
    }

    offset += length;
  }

  return anchors;
}

export type FreezeMasterInput = {
  transcript: TranscriptDocument;
  accepted: readonly CleanupProposal[];
  sourceDurationSeconds: number;
  handleSeconds?: number;
};

/**
 * Applies accepted proposals and freezes the result.
 *
 * The anchor index maps surviving words to *master* time, so storyboard
 * scenes can be anchored against the cleaned cut rather than the original.
 */
export function freezeMaster(input: FreezeMasterInput): FrozenMaster {
  if (!Number.isFinite(input.sourceDurationSeconds) || input.sourceDurationSeconds <= 0) {
    throw new CutListError("invalid-duration", "duration must be a positive number");
  }

  // Removals already saved in the document count too: freezing must never
  // resurrect a word the user deleted before opening the review.
  const removed = new Set<string>(input.transcript.removedWordIds);

  for (const proposal of input.accepted) {
    for (let index = proposal.fromIndex; index <= proposal.toIndex; index += 1) {
      const word = input.transcript.words[index];
      if (word !== undefined) {
        removed.add(word.id);
      }
    }
  }

  const removedWordIds = input.transcript.words
    .filter((word) => removed.has(word.id))
    .map((word) => word.id);

  const handleSeconds = input.handleSeconds ?? 0;
  const transcript = { ...input.transcript, removedWordIds };

  const items = buildTimeline({
    transcript,
    handleSeconds,
    durationSeconds: input.sourceDurationSeconds,
  });

  const kept = keptRanges(items);
  const keptDurationSeconds = round(
    kept.reduce((total, range) => total + (range.end - range.start), 0),
  );
  const silenceSeconds = items.reduce(
    (total, item) => total + (item.kind === "silence" ? item.durationSeconds : 0),
    0,
  );
  const masterDurationSeconds = round(keptDurationSeconds + silenceSeconds);

  const cutList: CutList = {
    durationSeconds: round(input.sourceDurationSeconds),
    kept,
    removed: removedRanges(kept, round(input.sourceDurationSeconds)),
    keptDurationSeconds,
  };

  const anchorWords = mapTimelineAnchors(input.transcript.words, removed, items);

  const legacyEligible =
    !items.some((item) => item.kind === "silence") && !isReordered(input.transcript.words);

  const fingerprint = createHash("sha256")
    .update(canonicalJson({ v: FINGERPRINT_VERSION, removedWordIds, items }))
    .digest("hex");

  return {
    removedWordIds,
    cutList,
    anchorWords,
    masterDurationSeconds,
    fingerprint,
    legacyEligible,
  };
}

/**
 * The pre-E2 fingerprint: removals plus the kept source ranges. Stored
 * fingerprints from projects frozen before the ordered timeline still match
 * this, so an unedited project does not re-anchor after the upgrade.
 */
export function legacyFingerprint(frozen: FrozenMaster): string {
  return createHash("sha256")
    .update(canonicalJson({ removedWordIds: frozen.removedWordIds, kept: frozen.cutList.kept }))
    .digest("hex");
}

/** True when a storyboard was anchored to a different cut than the one frozen now. */
export function requiresReanchor(frozen: FrozenMaster, fingerprint: string): boolean {
  if (fingerprint === frozen.fingerprint) {
    return false;
  }
  if (frozen.legacyEligible && fingerprint === legacyFingerprint(frozen)) {
    return false;
  }
  return true;
}
