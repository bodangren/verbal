import type { JobRegistry } from "@verbal/core";
import type { AssemblyStep } from "@verbal/compose";
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
};

/**
 * Runs a storyboard export as a job.
 *
 * Assembly and provenance share the job lifecycle, so progress, cancellation,
 * and failure behave exactly like the cut-list export.
 */
export async function runStoryboardExport(input: StoryboardExportInput): Promise<void> {
  await runExportJob(input.registry, input.jobId, async (report, signal) => {
    const assembled = await input.assemble(input.plan, input.outputPath, report, signal);
    const manifestPath = await input.writeProvenance(input.outputPath);

    return {
      outputPath: input.outputPath,
      manifestPath,
      files: assembled.files.length,
    };
  });
}
