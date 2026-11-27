import type { JobRegistry } from "@verbal/core";
import type { BatchItemOutcome } from "./batch-runner";

export function createBatchProgressWriter(
  registry: JobRegistry,
  jobId: string,
  signal: AbortSignal,
) {
  let pending: Promise<void> = Promise.resolve();

  return {
    report(outcome: BatchItemOutcome, done: number, total: number): void {
      pending = pending
        .then(async () => {
          if (!signal.aborted) {
            await registry.progress(
              jobId,
              total === 0 ? 1 : done / total,
              `${outcome.root}: ${outcome.status}`,
            );
          }
        })
        .catch(() => undefined);
    },
    flush(): Promise<void> {
      return pending;
    },
  };
}
