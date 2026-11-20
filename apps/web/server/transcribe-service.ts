import { createWhisperProvider, AiError, type TranscriptionProvider } from "@verbal/ai";
import {
  ProjectError,
  createTranscript,
  nodeFileSystem,
  openProject,
  projectPaths,
  resolveMediaPath,
  saveTranscript,
  type FileSystem,
  type JobRecord,
  type JobRegistry,
} from "@verbal/core";
import { getJobRegistry } from "./registry";
import { runTranscriptionJob } from "./transcribe-job";

export type TranscribeServiceDeps = {
  fs: FileSystem;
  registry: () => Promise<JobRegistry>;
  apiKey: () => string;
  baseUrl: () => string | undefined;
  createProvider: (config: { apiKey: string; baseUrl?: string }) => TranscriptionProvider;
};

/**
 * Starts one project's transcription as a job.
 *
 * Shared by the single and batch routes so the provider construction, the media
 * resolution, and the transcript write exist once: a batch that behaved
 * differently from a single run would be a second, untested transcription path.
 */
export function createTranscribeService(overrides: Partial<TranscribeServiceDeps> = {}) {
  const deps: TranscribeServiceDeps = {
    fs: nodeFileSystem,
    registry: getJobRegistry,
    apiKey: () => process.env.OPENAI_API_KEY ?? "",
    baseUrl: () => process.env.OPENAI_BASE_URL,
    createProvider: (config) => createWhisperProvider(config),
    ...overrides,
  };

  return {
    /** Resolves the media file a project would transcribe. */
    async mediaPathFor(root: string): Promise<string | null> {
      const project = await openProject(deps.fs, root);
      return resolveMediaPath(project, root);
    },

    /**
     * Transcribes one project to completion without creating a job.
     *
     * The batch runner awaits each project, so it needs a call that settles
     * rather than a job record to poll.
     */
    async transcribeNow(root: string): Promise<number> {
      const apiKey = deps.apiKey();
      if (apiKey.trim() === "") {
        throw new AiError("not-configured", "OPENAI_API_KEY is not set");
      }

      const mediaPath = await this.mediaPathFor(root);
      if (mediaPath === null) {
        throw new ProjectError("invalid-document", "project has no media");
      }

      const baseUrl = deps.baseUrl();
      const provider = deps.createProvider({
        apiKey,
        ...(baseUrl === undefined ? {} : { baseUrl }),
      });

      const result = await provider.transcribe({ filePath: mediaPath });

      await saveTranscript(
        deps.fs,
        projectPaths(root).transcript,
        createTranscript(result.words),
      );

      return result.words.length;
    },

    async start(root: string): Promise<JobRecord> {
      const apiKey = deps.apiKey();
      if (apiKey.trim() === "") {
        // Mapped to 503 by the API error layer, like any unconfigured provider.
        throw new AiError("not-configured", "OPENAI_API_KEY is not set");
      }

      const mediaPath = await this.mediaPathFor(root);
      if (mediaPath === null) {
        throw new ProjectError("invalid-document", "project has no media");
      }

      const baseUrl = deps.baseUrl();
      const provider = deps.createProvider({
        apiKey,
        ...(baseUrl === undefined ? {} : { baseUrl }),
      });

      const registry = await deps.registry();
      const job = await registry.create("transcribe");

      void runTranscriptionJob({
        registry,
        jobId: job.id,
        provider,
        request: { filePath: mediaPath },
        onTranscript: async (result) => {
          await saveTranscript(
            deps.fs,
            projectPaths(root).transcript,
            createTranscript(result.words),
          );
        },
      });

      return job;
    },
  };
}
