/** What the planner needs to know about one candidate project. */
export type BatchProject = {
  root: string;
  hasMedia: boolean;
  hasTranscript: boolean;
};

export type BatchSkipReason = "transcribed" | "no-media";

export type BatchItem = {
  root: string;
  action: "transcribe" | "skip";
  reason?: BatchSkipReason;
};

export type BatchPlan = {
  items: BatchItem[];
  skipped: { root: string; reason: BatchSkipReason }[];
};

/**
 * Decides what a transcription batch should do, in the caller's order.
 *
 * The plan is derived from project state rather than stored, so it is cheap to
 * recompute and cannot go stale: a project that gained a transcript since the
 * last request is skipped without any bookkeeping. A root listed twice is
 * planned once, at its first position, so one request cannot transcribe the
 * same project twice.
 */
export function planBatch(input: {
  projects: readonly BatchProject[];
  force?: boolean;
}): BatchPlan {
  const seen = new Set<string>();
  const plan: BatchPlan = { items: [], skipped: [] };

  for (const project of input.projects) {
    if (seen.has(project.root)) {
      continue;
    }
    seen.add(project.root);

    if (!project.hasMedia) {
      plan.items.push({ root: project.root, action: "skip", reason: "no-media" });
      plan.skipped.push({ root: project.root, reason: "no-media" });
      continue;
    }

    if (project.hasTranscript && input.force !== true) {
      plan.items.push({ root: project.root, action: "skip", reason: "transcribed" });
      plan.skipped.push({ root: project.root, reason: "transcribed" });
      continue;
    }

    plan.items.push({ root: project.root, action: "transcribe" });
  }

  return plan;
}
