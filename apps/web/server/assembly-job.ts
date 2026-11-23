import {
  buildConcatArgs,
  buildConcatListContent,
  buildVideoRangeArgs,
} from "@verbal/compose";
import type { JobRegistry } from "@verbal/core";
import type { EdlRange } from "@verbal/takes";
import type { CaptureSpawner } from "./capture-job";

export type AssemblyJobDeps = {
  registry: JobRegistry;
  spawn: CaptureSpawner;
  mkdir: (path: string) => Promise<void>;
  writeFile: (path: string, data: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
};

export type AssemblyJobInput = {
  jobId: string;
  ranges: readonly EdlRange[];
  takePath: string;
  outputPath: string;
  workDir: string;
  width: number;
  height: number;
  fps: number;
  /** Runs after the concat succeeds and before the job is marked done. */
  onOutput?: (outputPath: string) => Promise<void>;
};

/**
 * Renders an EDL: each range becomes a re-encoded segment, then the segments
 * concatenate with stream copy.
 *
 * A failed cut removes the partial output and every segment, so a broken cut
 * never looks like a finished video.
 */
export async function runAssemblyJob(
  deps: AssemblyJobDeps,
  input: AssemblyJobInput,
): Promise<void> {
  const controller = new AbortController();
  const segments = input.ranges.map(
    (_range, index) => `${input.workDir}/segment-${index}.mp4`,
  );
  const listPath = `${input.workDir}/concat.txt`;

  try {
    await deps.registry.start(input.jobId);
    await deps.mkdir(input.workDir);

    for (let index = 0; index < input.ranges.length; index += 1) {
      const range = input.ranges[index]!;
      const segment = segments[index]!;
      await deps.spawn(
        "ffmpeg",
        buildVideoRangeArgs({
          input: input.takePath,
          startSeconds: range.startSeconds,
          durationSeconds: Math.max(0.001, range.endSeconds - range.startSeconds),
          outputPath: segment,
          width: input.width,
          height: input.height,
          fps: input.fps,
        }),
        { signal: controller.signal, onStdout: () => undefined },
      );
      await deps.registry.progress(
        input.jobId,
        ((index + 1) / (input.ranges.length + 1)) * 0.9,
        "cutting",
      );
    }

    await deps.writeFile(listPath, buildConcatListContent(segments));
    await deps.spawn("ffmpeg", buildConcatArgs(listPath, input.outputPath), {
      signal: controller.signal,
      onStdout: () => undefined,
    });

    await input.onOutput?.(input.outputPath);
    await deps.registry.complete(input.jobId, {
      outputPath: input.outputPath,
      ranges: input.ranges.length,
    });
  } catch (error) {
    await deps.unlink(input.outputPath).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    await deps.registry.fail(input.jobId, message).catch(() => undefined);
  } finally {
    await Promise.all(
      segments.map((segment) => deps.unlink(segment).catch(() => undefined)),
    );
    await deps.unlink(listPath).catch(() => undefined);
  }
}
