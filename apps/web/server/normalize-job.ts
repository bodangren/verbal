import type { JobRegistry } from "@verbal/core";
import { createProgressParser, publishAtomically } from "@verbal/media";
import type { CaptureSpawner } from "./capture-job";

/**
 * Builds the argv that normalizes a browser recording to the project format.
 *
 * MediaRecorder may produce VP9/VP8 WebM or MP4 depending on the browser; the
 * rest of the app reads one MP4/H.264/AAC file, so every take is transcoded.
 */
export function buildNormalizeArgs(inputPath: string, outputPath: string): string[] {
  if (inputPath.trim() === "" || outputPath.trim() === "") {
    throw new Error("input and output paths are required");
  }

  return [
    "-y",
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath,
  ];
}

export type NormalizeJobDeps = {
  registry: JobRegistry;
  spawn: CaptureSpawner;
  unlink: (path: string) => Promise<void>;
  rename?: (from: string, to: string) => Promise<void>;
};

export type NormalizeJobInput = {
  jobId: string;
  inputPath: string;
  outputPath: string;
  durationSeconds: number;
  /** Runs after FFmpeg succeeds and before the job is marked done. */
  onOutput?: (outputPath: string) => Promise<void>;
};

/**
 * Normalizes one uploaded take and tracks it as a job.
 *
 * FFmpeg writes to a partial sibling of the destination, which is renamed over
 * it only after FFmpeg succeeds and the job enters its publication boundary. A
 * failed or cancelled normalize removes only the partial, so an existing take
 * file stays byte-identical. The uploaded source is removed by the caller
 * after the job settles.
 */
export async function runNormalizeJob(
  deps: NormalizeJobDeps,
  input: NormalizeJobInput,
): Promise<void> {
  const signal = deps.registry.signalOf(input.jobId);
  if (signal === undefined) {
    throw new Error(`job ${input.jobId} has no abort signal`);
  }

  let pending: Promise<unknown> = Promise.resolve();
  const feed = createProgressParser(input.durationSeconds, (progress) => {
    pending = pending
      .then(() =>
        deps.registry.progress(input.jobId, 0.1 + progress.percent * 0.8, "normalizing"),
      )
      .catch(() => undefined);
  });

  try {
    await deps.registry.start(input.jobId);
    await deps.registry.progress(input.jobId, 0.1, "normalizing");

    await publishAtomically({
      outputPath: input.outputPath,
      jobId: input.jobId,
      write: async (partialPath) => {
        await deps.spawn("ffmpeg", buildNormalizeArgs(input.inputPath, partialPath), {
          signal,
          onStdout: feed,
        });
      },
      rename: deps.rename,
      unlink: deps.unlink,
      beforeRename: () => deps.registry.beginPublish(input.jobId),
      afterRename: async () => {
        await input.onOutput?.(input.outputPath);
      },
    });

    await pending;
    if (signal.aborted) return;
    await deps.registry.complete(input.jobId, { outputPath: input.outputPath });
  } catch (error) {
    await pending;
    if (signal.aborted) {
      await deps.registry.cancel(input.jobId).catch(() => undefined);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    await deps.registry.fail(input.jobId, message).catch(() => undefined);
  } finally {
    deps.registry.endPublish(input.jobId);
  }
}
