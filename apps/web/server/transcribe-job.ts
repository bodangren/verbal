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
};

/**
 * Runs transcription against a job's lifecycle.
 *
 * The transcript is stored only after the provider succeeds, so a failed job
 * never leaves a half-written transcript on disk.
 */
export async function runTranscriptionJob(input: TranscriptionJobInput): Promise<void> {
  const { registry, jobId } = input;

  try {
    await registry.start(jobId);
    await registry.progress(jobId, 0.1, "transcribing");

    const result = await input.provider.transcribe(input.request);

    await registry.progress(jobId, 0.9, "saving transcript");
    await input.onTranscript(result);

    await registry.complete(jobId, { words: result.words.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await registry.fail(jobId, message).catch(() => undefined);
  }
}
