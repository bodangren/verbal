import {
  buildConcatArgs,
  buildConcatListContent,
  buildVideoRangeArgs,
} from "@verbal/compose";
import type { JobRegistry } from "@verbal/core";
import { publishAtomically } from "@verbal/media";
import type { EdlRange } from "@verbal/takes";
import type { CaptureSpawner } from "./capture-job";

export type AssemblyJobDeps = {
  registry: JobRegistry;
  spawn: CaptureSpawner;
  mkdir: (path: string) => Promise<void>;
  writeFile: (path: string, data: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  rename?: (from: string, to: string) => Promise<void>;
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
 * The concat writes to a partial sibling of the destination, which is renamed
 * over it only after the concat succeeds and the job enters its publication
 * boundary. A failed or cancelled cut removes the partial output and every
 * segment, so a broken cut never looks like a finished video and an existing
 * destination stays byte-identical.
 */
export async function runAssemblyJob(
  deps: AssemblyJobDeps,
  input: AssemblyJobInput,
): Promise<void> {
  const signal = deps.registry.signalOf(input.jobId);
  if (signal === undefined) {
    throw new Error(`job ${input.jobId} has no abort signal`);
  }

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
        { signal, onStdout: () => undefined },
      );
      await deps.registry.progress(
        input.jobId,
        ((index + 1) / (input.ranges.length + 1)) * 0.9,
        "cutting",
      );
    }

    await publishAtomically({
      outputPath: input.outputPath,
      jobId: input.jobId,
      write: async (partialPath) => {
        await deps.writeFile(listPath, buildConcatListContent(segments));
        await deps.spawn("ffmpeg", buildConcatArgs(listPath, partialPath), {
          signal,
          onStdout: () => undefined,
        });
      },
      rename: deps.rename,
      unlink: deps.unlink,
      beforeRename: () => deps.registry.beginPublish(input.jobId),
      afterRename: async () => {
        await input.onOutput?.(input.outputPath);
      },
    });

    if (signal.aborted) return;
    await deps.registry.complete(input.jobId, {
      outputPath: input.outputPath,
      ranges: input.ranges.length,
    });
  } catch (error) {
    if (signal.aborted) {
      await deps.registry.cancel(input.jobId).catch(() => undefined);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    await deps.registry.fail(input.jobId, message).catch(() => undefined);
  } finally {
    deps.registry.endPublish(input.jobId);
    await Promise.all(
      segments.map((segment) => deps.unlink(segment).catch(() => undefined)),
    );
    await deps.unlink(listPath).catch(() => undefined);
  }
}
