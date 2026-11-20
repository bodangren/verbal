import type { TranscriptDocument } from "./transcript";

/** An inclusive range of word indices that matched a query. */
export type MatchRange = {
  fromIndex: number;
  toIndex: number;
};

/**
 * Lowercases and reduces every run of non-alphanumeric characters to one space.
 *
 * Both the transcript words and the query go through this, so punctuation and
 * incidental spacing never decide whether something matches.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Entry = {
  index: number;
  text: string;
};

/** Finds every occurrence of `needle` in one run of consecutive kept words. */
function matchesInSegment(
  entries: readonly Entry[],
  needle: string,
  push: (range: MatchRange) => void,
): void {
  const kept = entries
    .map((entry) => ({ index: entry.index, text: normalise(entry.text) }))
    .filter((entry) => entry.text !== "");

  if (kept.length === 0) {
    return;
  }

  // Concatenate with single spaces, remembering which word owns each character.
  let haystack = "";
  const owner: number[] = [];

  kept.forEach((entry, ordinal) => {
    if (haystack.length > 0) {
      haystack += " ";
      owner.push(-1);
    }
    for (const character of entry.text) {
      haystack += character;
      owner.push(ordinal);
    }
  });

  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) {
      break;
    }

    let first = -1;
    let last = -1;
    for (let position = at; position < at + needle.length; position += 1) {
      const ordinal = owner[position];
      if (ordinal === undefined || ordinal < 0) {
        continue;
      }
      if (first === -1) {
        first = ordinal;
      }
      last = ordinal;
    }

    if (first !== -1) {
      const from = kept[first]?.index;
      const to = kept[last]?.index;
      if (from !== undefined && to !== undefined) {
        push({ fromIndex: from, toIndex: to });
      }
    }

    cursor = at + 1;
  }
}

/**
 * Every place a query occurs in the transcript, as inclusive word ranges.
 *
 * Matching spans word boundaries ("hello world") and ignores case and
 * punctuation. Removed words are hard breaks: they are not found themselves and
 * no match may run across one, because a removed word is not navigable.
 */
export function searchTranscript(
  transcript: TranscriptDocument,
  query: string,
): MatchRange[] {
  const needle = normalise(query);
  if (needle === "") {
    return [];
  }

  const removed = new Set(transcript.removedWordIds);
  const results: MatchRange[] = [];
  const seen = new Set<string>();

  const push = (range: MatchRange) => {
    const key = `${range.fromIndex}:${range.toIndex}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    results.push(range);
  };

  let segment: Entry[] = [];

  transcript.words.forEach((word, index) => {
    if (removed.has(word.id)) {
      matchesInSegment(segment, needle, push);
      segment = [];
      return;
    }

    segment.push({ index, text: word.text });
  });

  matchesInSegment(segment, needle, push);

  return results.sort((left, right) =>
    left.fromIndex === right.fromIndex
      ? left.toIndex - right.toIndex
      : left.fromIndex - right.fromIndex,
  );
}
