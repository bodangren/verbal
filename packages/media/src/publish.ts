import { promises as nodeFs } from "node:fs";
import { extname } from "node:path";

/**
 * The sibling partial path an atomic publication writes before it renames.
 *
 * The partial keeps the destination's extension so ffmpeg still picks the
 * right muxer, and the job id makes concurrent exports of one destination
 * write to different files.
 */
export function partialPathFor(outputPath: string, jobId: string): string {
  const extension = extname(outputPath);
  const stem = extension === "" ? outputPath : outputPath.slice(0, -extension.length);
  return `${stem}.${jobId}.partial${extension}`;
}

export type PublishOptions = {
  outputPath: string;
  jobId: string;
  /** Writes the content to the partial path. */
  write: (partialPath: string) => Promise<void>;
  rename?: (from: string, to: string) => Promise<void>;
  unlink?: (path: string) => Promise<void>;
  /** Runs after a successful rename, before the publication resolves. */
  afterRename?: () => Promise<void>;
  /**
   * Runs after `write`, before the rename. Return false to skip the rename and
   * remove the partial, so a cancelled job publishes nothing.
   */
  beforeRename?: () => boolean | Promise<boolean>;
};

/**
 * Publishes an export atomically.
 *
 * The content lands in a unique partial file next to the destination. The
 * partial is renamed over the destination only after `write` resolves, and
 * `afterRename` runs only after that rename. On any failure the partial is
 * removed and an existing destination is left byte-identical.
 */
export async function publishAtomically(options: PublishOptions): Promise<void> {
  const partialPath = partialPathFor(options.outputPath, options.jobId);
  const rename = options.rename ?? ((from: string, to: string) => nodeFs.rename(from, to));
  const unlink =
    options.unlink ??
    (async (path: string) => {
      await nodeFs.unlink(path);
    });

  try {
    await options.write(partialPath);
    const proceed = await options.beforeRename?.();
    if (proceed === false) {
      await unlink(partialPath).catch(() => undefined);
      return;
    }
    await rename(partialPath, options.outputPath);
    await options.afterRename?.();
  } catch (error) {
    await unlink(partialPath).catch(() => undefined);
    throw error;
  }
}
