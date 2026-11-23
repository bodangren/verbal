import {
  alignTake,
  buildEdl,
  splitBeats,
  type EditDecisionList,
} from "@verbal/takes";
import type { TakeTranscript } from "./take-transcript";

/** The EDL for one take, based on how well each beat matched the script. */
export function buildTakeEdl(
  script: string,
  transcript: TakeTranscript,
  takeId: string,
  durationSeconds: number,
): EditDecisionList {
  const beats = splitBeats(script);
  const alignment = alignTake(beats, transcript.words);
  return buildEdl(alignment, { takeId, durationSeconds });
}

/** Total kept seconds, rounded to milliseconds. */
export function edlDuration(
  ranges: readonly { startSeconds: number; endSeconds: number }[],
): number {
  return Number(
    ranges
      .reduce((sum, range) => sum + Math.max(0, range.endSeconds - range.startSeconds), 0)
      .toFixed(3),
  );
}
