import type { JobRegistry } from "@verbal/core";
import type {
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
} from "@verbal/ai";

export type TranscriptionJobInput = {
  registry: JobRegistry;
  jobId: string;
  provider: TranscriptionProvider;
  request: TranscriptionRequest;
  /** Called only when transcription succeeded. */
  onTranscript: (result: TranscriptionResult) => Promise<void>;
  /** Receives the provider's progress so the job can show it. */
  onProgress?: (fraction: number) => void;
  /** Waits for outstanding progress writes before the job moves on. */
  flushProgress?: () => Promise<void>;
};

/**
 * Runs transcription against a job's lifecycle.
 *
 * The transcript is stored only after the provider succeeds, so a failed job
 * never leaves a half-written transcript on disk.
 */
export async function runTranscriptionJob(input: TranscriptionJobInput): Promise<void> {
  const { registry, jobId } = input;
  const signal = registry.signalOf(jobId);

  try {
    if (signal === undefined) throw new Error(`job ${jobId} has no abort signal`);
    await registry.start(jobId);
    await registry.progress(jobId, 0, "Extracting audio…");

    const result = await input.provider.transcribe(input.request, {
      onProgress: input.onProgress,
      signal,
    });
    await input.flushProgress?.();
    if (signal.aborted) return;

    await registry.progress(jobId, 1, "saving transcript");
    if (signal.aborted) return;
    if (!registry.beginPublish(jobId)) return;
    await input.onTranscript(result);

    await registry.complete(jobId, { words: result.words.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await registry.fail(jobId, message).catch(() => undefined);
  }
}
