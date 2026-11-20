import { createHash } from "node:crypto";
import type { TranscriptDocument, TranscriptWord } from "@verbal/core";
import { buildCutList, type CutList, type CutRange } from "@verbal/media";
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
};

const PRECISION = 1_000_000;
const EPSILON = 1e-9;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

function mapAnchors(
  words: readonly TranscriptWord[],
  removed: ReadonlySet<string>,
  kept: readonly CutRange[],
): AnchorEntry[] {
  const anchors: AnchorEntry[] = [];
  const mapped = new Set<string>();
  let offset = 0;

  for (const range of kept) {
    const length = range.end - range.start;

    for (const word of words) {
      if (removed.has(word.id) || mapped.has(word.id)) {
        continue;
      }
      if (word.start < range.start - EPSILON || word.start >= range.end - EPSILON) {
        continue;
      }

      anchors.push({
        id: word.id,
        start: round(offset + Math.max(0, word.start - range.start)),
        end: round(offset + Math.min(length, word.end - range.start)),
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
  const removed = new Set<string>();

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

  const cutList = buildCutList({
    transcript: { ...input.transcript, removedWordIds },
    durationSeconds: input.sourceDurationSeconds,
    handleSeconds: input.handleSeconds ?? 0,
  });

  const anchorWords = mapAnchors(input.transcript.words, removed, cutList.kept);

  const fingerprint = createHash("sha256")
    .update(canonicalJson({ removedWordIds, kept: cutList.kept }))
    .digest("hex");

  return {
    removedWordIds,
    cutList,
    anchorWords,
    masterDurationSeconds: cutList.keptDurationSeconds,
    fingerprint,
  };
}

/** True when a storyboard was anchored to a different cut than the one frozen now. */
export function requiresReanchor(frozen: FrozenMaster, fingerprint: string): boolean {
  return frozen.fingerprint !== fingerprint;
}
