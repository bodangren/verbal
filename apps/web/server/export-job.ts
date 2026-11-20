import type { JobRegistry } from "@verbal/core";
import { ExportError } from "@verbal/media";

export type JobReport = (fraction: number, message?: string) => void;

/**
 * Runs a unit of work against a job's lifecycle.
 *
 * Progress writes are serialised through a promise chain, so the job can never
 * be completed before its last progress update lands. A cancellation is
 * reported as `cancelled`, not `failed`.
 */
export async function runExportJob(
  registry: JobRegistry,
  jobId: string,
  work: (report: JobReport, signal: AbortSignal) => Promise<unknown>,
): Promise<void> {
  const controller = new AbortController();
  let pending: Promise<unknown> = Promise.resolve();

  const report: JobReport = (fraction, message) => {
    pending = pending
      .then(() => registry.progress(jobId, fraction, message))
      .catch(() => undefined);
  };

  try {
    await registry.start(jobId);
    const result = await work(report, controller.signal);
    await pending;
    await registry.complete(jobId, result ?? null);
  } catch (error) {
    await pending;

    if (error instanceof ExportError && error.code === "cancelled") {
      await registry.cancel(jobId).catch(() => undefined);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    await registry.fail(jobId, message).catch(() => undefined);
  }
}
