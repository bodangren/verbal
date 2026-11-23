import type { BeatStatus, TakeAlignment, TakeWord } from "./align";

export type EdlRange = {
  takeId: string;
  startSeconds: number;
  endSeconds: number;
};

export type EditDecisionList = {
  ranges: EdlRange[];
};

export type BuildEdlOptions = {
  takeId: string;
  /** Seconds of pre/post roll around each kept beat. */
  handleSeconds?: number;
  durationSeconds?: number;
  /** Beat statuses to keep; good by default. */
  keep?: readonly BeatStatus[];
};

/**
 * Turns a review alignment into an ordered edit decision list.
 *
 * Only kept beats contribute ranges, each range gets a small handle, and
 * adjacent or overlapping ranges merge so the cut is one continuous take.
 */
function roundSeconds(value: number): number {
  return Number(value.toFixed(3));
}

export function buildEdl(
  alignment: TakeAlignment,
  options: BuildEdlOptions,
): EditDecisionList {
  const handle = Math.max(0, options.handleSeconds ?? 0.1);
  const keep = new Set<BeatStatus>(options.keep ?? ["good"]);
  const max = options.durationSeconds ?? Number.POSITIVE_INFINITY;
  const ranges: EdlRange[] = [];

  for (const beat of alignment.beats) {
    if (!keep.has(beat.status)) {
      continue;
    }
    if (beat.startSeconds === null || beat.endSeconds === null) {
      continue;
    }

    const start = Math.max(0, roundSeconds(beat.startSeconds - handle));
    const end = Math.min(max, roundSeconds(beat.endSeconds + handle));
    if (end <= start) {
      continue;
    }

    const previous = ranges[ranges.length - 1];
    if (previous !== undefined && start <= previous.endSeconds) {
      previous.endSeconds = Math.max(previous.endSeconds, end);
    } else {
      ranges.push({ takeId: options.takeId, startSeconds: start, endSeconds: end });
    }
  }

  return { ranges };
}

/**
 * Concatenates the kept ranges' words and shifts them to the new timeline.
 *
 * A word that only partly overlaps a range is clamped to the cut; words
 * outside every range are dropped.
 */
export function edlTranscript(
  ranges: readonly EdlRange[],
  wordsByTake: Readonly<Record<string, readonly TakeWord[]>>,
): TakeWord[] {
  const result: TakeWord[] = [];
  let offset = 0;

  for (const range of ranges) {
    const words = wordsByTake[range.takeId] ?? [];
    for (const word of words) {
      if (word.end <= range.startSeconds || word.start >= range.endSeconds) {
        continue;
      }
      const start = Math.max(word.start, range.startSeconds) - range.startSeconds + offset;
      const end = Math.min(word.end, range.endSeconds) - range.startSeconds + offset;
      if (end <= start) {
        continue;
      }
      result.push({ text: word.text, start, end });
    }
    offset += range.endSeconds - range.startSeconds;
  }

  return result;
}
