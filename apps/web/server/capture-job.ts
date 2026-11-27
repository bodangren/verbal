import type { JobRegistry } from "@verbal/core";
import {
  buildCaptureArgs,
  createProgressParser,
  publishAtomically,
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
  rename?: (from: string, to: string) => Promise<void>;
};

export type CaptureJobInput = {
  jobId: string;
  request: CaptureRequest;
  /** Runs after the recording is published and before the job is marked done. */
  onOutput?: (outputPath: string) => Promise<void>;
};

/**
 * Records one capture and tracks it as a job.
 *
 * FFmpeg writes to a partial sibling of the destination, which is renamed over
 * it only after the recording succeeds and the job enters its publication
 * boundary. A failed or cancelled capture removes only the partial, so a broken
 * take never looks like a finished one. A save that fails after the rename
 * removes the published file, which the project does not reference.
 */
export async function runCaptureJob(
  deps: CaptureJobDeps,
  input: CaptureJobInput,
): Promise<void> {
  const signal = deps.registry.signalOf(input.jobId);
  if (signal === undefined) {
    throw new Error(`job ${input.jobId} has no abort signal`);
  }

  let pending: Promise<unknown> = Promise.resolve();
  const feed = createProgressParser(input.request.durationSeconds, (progress) => {
    pending = pending
      .then(() => deps.registry.progress(input.jobId, progress.percent, "recording"))
      .catch(() => undefined);
  });

  let saveThrew = false;

  try {
    await deps.registry.start(input.jobId);

    await publishAtomically({
      outputPath: input.request.outputPath,
      jobId: input.jobId,
      write: async (partialPath) => {
        await deps.spawn(
          "ffmpeg",
          buildCaptureArgs({ ...input.request, outputPath: partialPath }),
          { signal, onStdout: feed },
        );
      },
      rename: deps.rename,
      unlink: deps.unlink,
      beforeRename: () => deps.registry.beginPublish(input.jobId),
      afterRename: async () => {
        try {
          await input.onOutput?.(input.request.outputPath);
        } catch (error) {
          saveThrew = true;
          throw error;
        }
      },
    });

    await pending;
    if (signal.aborted) return;
    await deps.registry.complete(input.jobId, { outputPath: input.request.outputPath });
  } catch (error) {
    await pending;
    if (signal.aborted) {
      await deps.registry.cancel(input.jobId).catch(() => undefined);
      return;
    }

    // The rename already ran but the project save failed, so the published file
    // is not referenced by the project. Remove it and say so.
    if (saveThrew) {
      await deps.unlink(input.request.outputPath).catch(() => undefined);
    }

    const message = error instanceof Error ? error.message : String(error);
    const note = saveThrew ? `; removed ${input.request.outputPath}` : "";
    await deps.registry.fail(input.jobId, `${message}${note}`).catch(() => undefined);
  } finally {
    deps.registry.endPublish(input.jobId);
  }
}
