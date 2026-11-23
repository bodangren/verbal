import type { JobRegistry } from "@verbal/core";
import { createProgressParser } from "@verbal/media";
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
 * A failed normalize removes the partial MP4; the uploaded source is removed
 * by the caller after the job settles.
 */
export async function runNormalizeJob(
  deps: NormalizeJobDeps,
  input: NormalizeJobInput,
): Promise<void> {
  const controller = new AbortController();
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
    await deps.spawn("ffmpeg", buildNormalizeArgs(input.inputPath, input.outputPath), {
      signal: controller.signal,
      onStdout: feed,
    });
    await pending;
    await input.onOutput?.(input.outputPath);
    await deps.registry.complete(input.jobId, { outputPath: input.outputPath });
  } catch (error) {
    await deps.unlink(input.outputPath).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    await deps.registry.fail(input.jobId, message).catch(() => undefined);
  }
}
