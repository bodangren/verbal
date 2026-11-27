import type { JobRegistry } from "@verbal/core";
import {
  buildCaptureArgs,
  createProgressParser,
  type CaptureRequest,
} from "@verbal/media";

export type CaptureSpawner = (
  file: string,
  args: readonly string[],
  options: { signal: AbortSignal; onStdout: (chunk: string) => void },
) => Promise<void>;

export type CaptureJobDeps = {
  registry: JobRegistry;
  spawn: CaptureSpawner;
  unlink: (path: string) => Promise<void>;
  signal?: AbortSignal;
};

/** A capture request plus the project save that runs before the job is done. */
export type CaptureJobRequest = CaptureRequest & {
  /** Runs after the recording succeeds and before the job is marked done. */
  onOutput?: (outputPath: string) => Promise<void>;
};

/**
 * Records one capture and tracks it as a job.
 *
 * The recording is written un-keyed. A failed or cancelled capture removes
 * the partial file, so a broken take never looks like a finished one.
 */
export async function runCaptureJob(
  deps: CaptureJobDeps,
  input: { jobId: string; request: CaptureJobRequest },
): Promise<void> {
  const args = buildCaptureArgs(input.request);
  const controller = new AbortController();
  const signal = deps.signal ?? controller.signal;

  let pending: Promise<unknown> = Promise.resolve();
  const feed = createProgressParser(input.request.durationSeconds, (progress) => {
    pending = pending
      .then(() => deps.registry.progress(input.jobId, progress.percent, "recording"))
      .catch(() => undefined);
  });

  try {
    await deps.registry.start(input.jobId);
    await deps.spawn("ffmpeg", args, { signal, onStdout: feed });
    await pending;

    if (signal.aborted) {
      await deps.registry.cancel(input.jobId).catch(() => undefined);
      await deps.unlink(input.request.outputPath).catch(() => undefined);
      return;
    }

    // The project save runs before the job reports done, so a save failure
    // fails the job instead of leaving a done job with an old reference.
    await input.request.onOutput?.(input.request.outputPath);

    await deps.registry.complete(input.jobId, { outputPath: input.request.outputPath });
  } catch (error) {
    await deps.unlink(input.request.outputPath).catch(() => undefined);

    if (signal.aborted) {
      await deps.registry.cancel(input.jobId).catch(() => undefined);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    await deps.registry.fail(input.jobId, message).catch(() => undefined);
  }
}
