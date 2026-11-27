import type { JobRegistry } from "@verbal/core";
import type { AssemblyStep } from "@verbal/compose";
import { publishAtomically } from "@verbal/media";
import { runExportJob } from "./export-job";

export type StoryboardExportAssemble = (
  plan: readonly AssemblyStep[],
  outputPath: string,
  report: (fraction: number, message?: string) => void,
  signal: AbortSignal,
) => Promise<{ files: string[] }>;

export type StoryboardExportInput = {
  registry: JobRegistry;
  jobId: string;
  plan: readonly AssemblyStep[];
  outputPath: string;
  assemble: StoryboardExportAssemble;
  writeProvenance: (outputPath: string) => Promise<string>;
  rename?: (from: string, to: string) => Promise<void>;
  unlink?: (path: string) => Promise<void>;
};

/**
 * Runs a storyboard export as a job.
 *
 * Assembly and provenance share the job lifecycle, so progress, cancellation,
 * and failure behave exactly like the cut-list export. The concatenation
 * writes to a unique partial file, which is renamed over the destination only
 * after the concat succeeds; provenance is written only after that rename.
 */
export async function runStoryboardExport(input: StoryboardExportInput): Promise<void> {
  await runExportJob(input.registry, input.jobId, async (report, signal) => {
    let files: string[] = [];
    let manifestPath = "";

    await publishAtomically({
      outputPath: input.outputPath,
      jobId: input.jobId,
      write: async (partialPath) => {
        const assembled = await input.assemble(input.plan, partialPath, report, signal);
        files = assembled.files;
      },
      rename: input.rename,
      unlink: input.unlink,
      beforeRename: () => input.registry.beginPublish(input.jobId),
      afterRename: async () => {
        manifestPath = await input.writeProvenance(input.outputPath);
      },
    });

    return {
      outputPath: input.outputPath,
      manifestPath,
      files: files.length,
    };
  });
}
