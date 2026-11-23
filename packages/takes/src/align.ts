import type { Beat } from "./beats";

export type TakeWord = {
  text: string;
  start: number;
  end: number;
};

export type BeatStatus = "good" | "bungled" | "skipped" | "improvised";

export type BeatAlignment = {
  beatId: string;
  index: number;
  status: BeatStatus;
  /** Matched script tokens divided by the beat's token count. */
  coverage: number;
  /** 0..1; currently the same signal as coverage. */
  confidence: number;
  startSeconds: number | null;
  endSeconds: number | null;
  spokeText: string;
};

export type TakeAlignment = {
  beats: BeatAlignment[];
};

/** Lower case, drop punctuation and apostrophes, keep digits. */
export function normalizeToken(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  const normalized = normalizeToken(text);
  return normalized === "" ? [] : normalized.split(/\s+/);
}

type Pair = {
  script: number;
  take: number | null;
};

/**
 * Needleman-Wunsch over script and take tokens.
 *
 * A match scores +1, a mismatch -1, and a gap -1. The result lists every
 * script token with the take index it aligned to, or null for a script gap.
 */
function alignTokens(script: readonly string[], take: readonly string[]): Pair[] {
  const width = take.length + 1;
  const score: number[][] = Array.from({ length: script.length + 1 }, () =>
    new Array<number>(width).fill(0),
  );

  for (let row = 1; row <= script.length; row += 1) {
    score[row]![0] = -row;
  }
  for (let column = 1; column <= take.length; column += 1) {
    score[0]![column] = -column;
  }

  for (let row = 1; row <= script.length; row += 1) {
    for (let column = 1; column <= take.length; column += 1) {
      const match = script[row - 1] === take[column - 1] ? 1 : -1;
      score[row]![column] = Math.max(
        score[row - 1]![column - 1]! + match,
        score[row - 1]![column]! - 1,
        score[row]![column - 1]! - 1,
      );
    }
  }

  const pairs: Pair[] = [];
  let row = script.length;
  let column = take.length;

  while (row > 0 || column > 0) {
    if (row > 0 && column > 0) {
      const match = script[row - 1] === take[column - 1] ? 1 : -1;
      if (score[row]![column] === score[row - 1]![column - 1]! + match) {
        pairs.unshift({ script: row - 1, take: column - 1 });
        row -= 1;
        column -= 1;
        continue;
      }
    }

    if (row > 0 && (column === 0 || score[row]![column] === score[row - 1]![column]! - 1)) {
      pairs.unshift({ script: row - 1, take: null });
      row -= 1;
      continue;
    }

    // A take word with no script token is not part of a script pair.
    column -= 1;
  }

  return pairs;
}

/**
 * Aligns a take transcript to the script beats.
 *
 * The result drives the review: fully spoken beats are good, partly spoken
 * beats are bungled, silent beats are skipped, and extra words between matched
 * beats are improvised.
 */
export function alignTake(beats: readonly Beat[], words: readonly TakeWord[]): TakeAlignment {
  if (beats.length === 0) {
    return { beats: [] };
  }

  const scriptTokens: string[] = [];
  const tokenBeat: number[] = [];
  beats.forEach((beat, beatIndex) => {
    for (const token of tokenize(beat.text)) {
      scriptTokens.push(token);
      tokenBeat.push(beatIndex);
    }
  });

  const takeTokens = words.map((word) => normalizeToken(word.text));
  const pairs = alignTokens(scriptTokens, takeTokens);
  const matchedByBeat = new Map<number, number[]>();

  for (const pair of pairs) {
    if (pair.take === null || scriptTokens[pair.script] !== takeTokens[pair.take]) {
      continue;
    }
    const beatIndex = tokenBeat[pair.script];
    if (beatIndex === undefined) {
      continue;
    }
    const matches = matchedByBeat.get(beatIndex) ?? [];
    matches.push(pair.take);
    matchedByBeat.set(beatIndex, matches);
  }

  const tokenCounts = beats.map(() => 0);
  for (const beatIndex of tokenBeat) {
    tokenCounts[beatIndex] = (tokenCounts[beatIndex] ?? 0) + 1;
  }

  const result: BeatAlignment[] = [];
  let cursor = 0;

  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index]!;
    const matched = [...(matchedByBeat.get(index) ?? [])].sort((a, b) => a - b);
    const tokenCount = tokenCounts[index] ?? 0;
    let status: BeatStatus;
    let coverage = 0;
    let startSeconds: number | null = null;
    let endSeconds: number | null = null;
    let spoken: string[] = [];

    if (matched.length > 0) {
      coverage = tokenCount === 0 ? 0 : matched.length / tokenCount;
      const first = matched[0]!;
      const last = matched[matched.length - 1]!;
      const span = words.slice(first, last + 1);
      spoken = span.map((word) => word.text);
      startSeconds = words[first]?.start ?? null;
      endSeconds = words[last]?.end ?? null;
      status = coverage >= 0.85 ? "good" : "bungled";
      cursor = last + 1;
    } else {
      let nextMatched = words.length;
      for (let later = index + 1; later < beats.length; later += 1) {
        const laterMatches = matchedByBeat.get(later);
        if (laterMatches !== undefined && laterMatches.length > 0) {
          nextMatched = Math.min(...laterMatches);
          break;
        }
      }

      const interval = words.slice(cursor, nextMatched);
      if (interval.length > 0) {
        status = "improvised";
        spoken = interval.map((word) => word.text);
        startSeconds = interval[0]?.start ?? null;
        endSeconds = interval[interval.length - 1]?.end ?? null;
      } else {
        status = "skipped";
      }
      cursor = nextMatched;
    }

    result.push({
      beatId: beat.id,
      index,
      status,
      coverage: Number(coverage.toFixed(2)),
      confidence: Number(coverage.toFixed(2)),
      startSeconds,
      endSeconds,
      spokeText: spoken.join(" "),
    });
  }

  return { beats: result };
}
