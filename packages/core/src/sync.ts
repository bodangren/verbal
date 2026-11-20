import type { TranscriptWord } from "./transcript";

/**
 * Finds the word being spoken at `seconds`.
 *
 * Returns the index of the last word whose start is at or before `seconds`.
 * A position in a silence therefore keeps the previous word active, which is
 * what a reader expects from a highlight that should not flicker off between
 * words. Returns -1 before the first word or when there are no words.
 *
 * O(log n): words are ordered by start time.
 */
export function wordIndexAtTime(
  words: readonly TranscriptWord[],
  seconds: number,
): number {
  let low = 0;
  let high = words.length - 1;
  let found = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const word = words[middle];

    if (word === undefined) {
      break;
    }

    if (word.start <= seconds) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}

/** The word being spoken at `seconds`, or null before the first word. */
export function wordAtTime(
  words: readonly TranscriptWord[],
  seconds: number,
): TranscriptWord | null {
  const index = wordIndexAtTime(words, seconds);
  return index >= 0 ? (words[index] ?? null) : null;
}
