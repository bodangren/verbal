import type { TranscriptDocument } from "@verbal/core";
import type { CleanupProposal, VisualCover } from "./types";

/**
 * Words that are almost never intended, only spoken.
 *
 * Deliberately conservative: "like" and "you know" are context-dependent and
 * would drown the review in false positives, so a provider-based detector is
 * the right home for them.
 */
export const DEFAULT_FILLERS = [
  "ah",
  "er",
  "erm",
  "hmm",
  "mm",
  "uh",
  "uhh",
  "um",
  "umm",
] as const;

export type DetectOptions = {
  /** Replaces the default filler list. Matching is case- and punctuation-insensitive. */
  fillers?: readonly string[];
};

type Candidate = {
  fromIndex: number;
  toIndex: number;
  category: CleanupProposal["category"];
  confidence: number;
  reason: string;
  cover: VisualCover;
};

/** Lowercase, letters only, so "Um," and "umm" match the same entry. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Proposes word spans worth cutting.
 *
 * Three passes run in priority order — filler, stutter, repetition — and each
 * claims the indices it proposes, so a span is proposed at most once and the
 * most specific reason wins. Removed words are invisible to the detector:
 * there is nothing left to cut.
 */
export function detectProposals(
  transcript: TranscriptDocument,
  options: DetectOptions = {},
): CleanupProposal[] {
  const fillers = new Set((options.fillers ?? [...DEFAULT_FILLERS]).map(normalise));
  const removed = new Set(transcript.removedWordIds);

  const words = transcript.words.map((word) => ({
    text: word.text,
    norm: normalise(word.text),
    removed: removed.has(word.id),
  }));

  const claimed = new Set<number>();
  const candidates: Candidate[] = [];

  const isAvailable = (index: number): boolean => {
    const word = words[index];
    return word !== undefined && !word.removed && !claimed.has(index);
  };

  // Fillers: one proposal per word, so each stays its own decision.
  words.forEach((word, index) => {
    if (!isAvailable(index) || !fillers.has(word.norm)) {
      return;
    }

    candidates.push({
      fromIndex: index,
      toIndex: index,
      category: "filler",
      confidence: 0.95,
      reason: `filler word "${word.text.trim()}"`,
      cover: "punch-in",
    });
    claimed.add(index);
  });

  // Stutters: a run of the same word repeated; the repeats are the cut.
  let index = 0;
  while (index < words.length) {
    if (!isAvailable(index)) {
      index += 1;
      continue;
    }

    const word = words[index];
    let end = index + 1;
    while (end < words.length && isAvailable(end) && words[end]?.norm === word?.norm) {
      end += 1;
    }

    if (end - index >= 2) {
      candidates.push({
        fromIndex: index + 1,
        toIndex: end - 1,
        category: "stutter",
        confidence: 0.9,
        reason: `"${word?.text ?? ""}" repeated immediately`,
        cover: "punch-in",
      });
      for (let repeat = index + 1; repeat < end; repeat += 1) {
        claimed.add(repeat);
      }
      index = end;
      continue;
    }

    index += 1;
  }

  // Repetitions: a two-word phrase said twice in a row ("I think I think").
  index = 0;
  while (index + 3 < words.length) {
    if (
      isAvailable(index) &&
      isAvailable(index + 1) &&
      isAvailable(index + 2) &&
      isAvailable(index + 3) &&
      words[index]?.norm !== "" &&
      words[index]?.norm === words[index + 2]?.norm &&
      words[index + 1]?.norm === words[index + 3]?.norm
    ) {
      const phrase = `${words[index]?.text ?? ""} ${words[index + 1]?.text ?? ""}`.trim();

      candidates.push({
        fromIndex: index + 2,
        toIndex: index + 3,
        category: "repetition",
        confidence: 0.8,
        reason: `"${phrase}" repeated immediately`,
        cover: "cutaway",
      });
      claimed.add(index + 2);
      claimed.add(index + 3);
      index += 4;
      continue;
    }

    index += 1;
  }

  return candidates
    .sort((left, right) => left.fromIndex - right.fromIndex)
    .map((candidate, position) => ({ id: `p${position + 1}`, ...candidate }));
}
