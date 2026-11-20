import type { BatchPlan } from "@verbal/core";

export type BatchItemOutcome = {
  root: string;
  status: "transcribed" | "failed" | "skipped";
  /** Why it was skipped, or the failure message. */
  detail?: string;
};

export type RunBatchInput = {
  plan: BatchPlan;
  /** Transcribes one project; rejects on failure. */
  transcribe: (root: string) => Promise<void>;
  /** Called after each item settles, for progress reporting. */
  report?: (outcome: BatchItemOutcome, done: number, total: number) => void;
};

/**
 * Runs a plan one item at a time.
 *
 * Sequential by design: providers rate-limit, and one project finishing before
 * the next starts is the only ordering a user can follow. A failed item is
 * recorded and the batch continues, because losing the remaining work to one
 * bad project would make a batch worse than clicking through by hand.
 */
export async function runBatch({
  plan,
  transcribe,
  report,
}: RunBatchInput): Promise<{ outcomes: BatchItemOutcome[] }> {
  const outcomes: BatchItemOutcome[] = [];

  for (const item of plan.items) {
    let outcome: BatchItemOutcome;

    if (item.action === "skip") {
      outcome = { root: item.root, status: "skipped", detail: item.reason };
    } else {
      try {
        await transcribe(item.root);
        outcome = { root: item.root, status: "transcribed" };
      } catch (error) {
        outcome = {
          root: item.root,
          status: "failed",
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }

    outcomes.push(outcome);
    report?.(outcome, outcomes.length, plan.items.length);
  }

  return { outcomes };
}
