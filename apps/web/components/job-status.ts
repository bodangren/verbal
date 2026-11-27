import type { JobRecord } from "@verbal/core/browser";
import { errorCopyFor } from "../lib/error-copy";

/** Text for the current job, or null when there is nothing to show. */
export function jobStatusText(job: JobRecord | null): string | null {
  if (job === null) {
    return null;
  }
  if (job.error !== null) {
    return errorCopyFor(job.error).message;
  }

  const percent = Math.round(job.progress * 100);
  const message = job.message === null ? "" : ` · ${job.message}`;
  return `Job ${job.status} · ${percent}%${message}`;
}

/** Drops a settled job so its words do not outlive the action that started it. */
export function clearFinishedJob(job: JobRecord | null): JobRecord | null {
  if (job === null || job.status === "queued" || job.status === "running") {
    return job;
  }
  return null;
}

/** Words for the live region when a job starts, or null when nothing starts. */
export function jobStartText(job: JobRecord | null): string | null {
  if (job === null || (job.status !== "queued" && job.status !== "running")) {
    return null;
  }
  return "Export started";
}

/** The export destination a done job reports, or null when it reports none. */
export function jobOutputPath(job: JobRecord): string | null {
  const result = job.result as { outputPath?: unknown } | null;
  if (result === null || typeof result !== "object") {
    return null;
  }
  return typeof result.outputPath === "string" && result.outputPath !== ""
    ? result.outputPath
    : null;
}

/** Words for the live region when a job settles, or null while it runs. */
export function jobResultText(job: JobRecord | null): string | null {
  if (job === null) {
    return null;
  }
  if (job.status === "done") {
    const outputPath = jobOutputPath(job);
    return outputPath === null ? "Export finished" : `Export finished: ${outputPath}`;
  }
  if (job.status === "failed") {
    return jobStatusText(job);
  }
  if (job.status === "cancelled") {
    return "Export cancelled";
  }
  return null;
}
