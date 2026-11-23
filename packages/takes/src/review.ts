import type { TakeAlignment, TakeWord } from "./align";
import type { Beat } from "./beats";

export type ReviewAction = "keep" | "cut" | "reread";

export type BeatProposal = {
  beatId: string;
  index: number;
  action: ReviewAction;
  reason: string;
  startSeconds: number | null;
  endSeconds: number | null;
};

export type ReviewResult = {
  proposals: BeatProposal[];
};

const ACTIONS: ReadonlySet<ReviewAction> = new Set(["keep", "cut", "reread"]);

export const REVIEW_SYSTEM =
  "You review a teleprompter take against its script. Return only JSON: " +
  '{"beats":[{"id":"b0","action":"keep|cut|reread","reason":"short","source":{"startSeconds":0,"endSeconds":1}}]}. ' +
  "Keep a good beat, reread a bungled or skipped beat, and cut only content that should not appear. " +
  "Sources must lie inside the take and must not overlap.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keep(beat: Beat, index: number): BeatProposal {
  return {
    beatId: beat.id,
    index,
    action: "keep",
    reason: "",
    startSeconds: null,
    endSeconds: null,
  };
}

function readRange(
  value: unknown,
): { startSeconds: number; endSeconds: number } | null {
  if (!isRecord(value)) {
    return null;
  }
  const start = value.startSeconds;
  const end = value.endSeconds;
  if (
    typeof start !== "number" ||
    !Number.isFinite(start) ||
    typeof end !== "number" ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start
  ) {
    return null;
  }
  return { startSeconds: start, endSeconds: end };
}

/**
 * Parses the LLM's JSON and keeps only safe proposals.
 *
 * Unknown beat ids are ignored, invalid actions and ranges fall back to keep,
 * and overlapping ranges are dropped in script order. The result always has
 * one proposal per beat, so the UI never has to guess.
 */
export function parseReviewResponse(
  raw: string,
  beats: readonly Beat[],
  durationSeconds: number,
): ReviewResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { proposals: beats.map(keep) };
  }

  const entries = isRecord(value) && Array.isArray(value.beats) ? value.beats : [];
  const byId = new Map<
    string,
    { action: ReviewAction; reason: string; startSeconds: number | null; endSeconds: number | null }
  >();

  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      continue;
    }
    const action = ACTIONS.has(entry.action as ReviewAction)
      ? (entry.action as ReviewAction)
      : "keep";
    const reason = typeof entry.reason === "string" ? entry.reason : "";
    const range = readRange(entry.source);

    if (action === "keep" || range === null || range.endSeconds > durationSeconds) {
      byId.set(entry.id, { action: "keep", reason, startSeconds: null, endSeconds: null });
      continue;
    }
    byId.set(entry.id, {
      action,
      reason,
      startSeconds: range.startSeconds,
      endSeconds: range.endSeconds,
    });
  }

  const proposals = beats.map((beat, index) => {
    const found = byId.get(beat.id);
    if (found === undefined) {
      return keep(beat, index);
    }
    return {
      beatId: beat.id,
      index,
      action: found.action,
      reason: found.reason,
      startSeconds: found.startSeconds,
      endSeconds: found.endSeconds,
    };
  });

  let cursor = 0;
  for (const proposal of proposals) {
    if (proposal.action === "keep" || proposal.startSeconds === null) {
      continue;
    }
    if (proposal.startSeconds < cursor) {
      proposal.action = "keep";
      proposal.startSeconds = null;
      proposal.endSeconds = null;
      continue;
    }
    cursor = proposal.endSeconds ?? cursor;
  }

  return { proposals };
}

/** The prompt the model sees: script beats, their alignment, and the take words. */
export function buildReviewPrompt(
  beats: readonly Beat[],
  alignment: TakeAlignment,
  words: readonly TakeWord[],
): string {
  const lines = ["Script beats:"];
  beats.forEach((beat, index) => {
    const item = alignment.beats[index];
    const status = item?.status ?? "unknown";
    const coverage = Math.round((item?.coverage ?? 0) * 100);
    const start = item?.startSeconds ?? "—";
    const end = item?.endSeconds ?? "—";
    lines.push(`- ${beat.id} [${status} ${coverage}%] "${beat.text}" (take ${start}-${end})`);
  });
  lines.push("Take words (text@start-end):");
  lines.push(words.map((word) => `${word.text}@${word.start.toFixed(2)}-${word.end.toFixed(2)}`).join(" "));
  return lines.join("\n");
}
