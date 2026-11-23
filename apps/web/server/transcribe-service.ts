import {
  createLocalWhisperProvider,
  createWhisperProvider,
  AiError,
  type TranscriptionProvider,
} from "@verbal/ai";
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

/** What the UI says about the provider the environment selected. */
export type TranscriptionProviderInfo = {
  mode: "local" | "cloud";
  label: string;
  /** True when audio leaves the machine. */
  cloud: boolean;
};

/**
 * Names the transcription provider for the UI.
 *
 * The environment chooses the provider; this only describes the choice, so
 * the stage can say where the audio goes before the user transcribes.
 */
export function describeTranscriptionProvider(
  asrMode: string | undefined,
): TranscriptionProviderInfo {
  if (asrMode === "local") {
    return { mode: "local", label: "Local (whisper)", cloud: false };
  }
  return { mode: "cloud", label: "Cloud (OpenAI-compatible)", cloud: true };
}

export type TranscribeServiceDeps = {
  fs: FileSystem;
  registry: () => Promise<JobRegistry>;
  apiKey: () => string;
  baseUrl: () => string | undefined;
  createProvider: (config: { apiKey: string; baseUrl?: string }) => TranscriptionProvider;
  /** "local" runs a whisper CLI; anything else uses the cloud provider. */
  asrMode: () => string | undefined;
  whisperModelPath: () => string | undefined;
  createLocalProvider: (config: { modelPath: string }) => TranscriptionProvider;
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
    asrMode: () => process.env.VERBAL_ASR,
    whisperModelPath: () => process.env.VERBAL_WHISPER_MODEL,
    createLocalProvider: (config) => createLocalWhisperProvider(config),
    ...overrides,
  };

  /**
   * The provider this request should use.
   *
   * Local mode deliberately does not require an API key — requiring one to run
   * an offline binary would defeat the point — and names its model, because a
   * whisper CLI without a model is a configuration error worth reporting.
   */
  function providerFor(config: { apiKey: string; baseUrl?: string }): TranscriptionProvider {
    if (deps.asrMode() === "local") {
      const modelPath = deps.whisperModelPath();
      if (modelPath === undefined || modelPath.trim() === "") {
        throw new AiError("not-configured", "VERBAL_WHISPER_MODEL is not set");
      }
      return deps.createLocalProvider({ modelPath });
    }

    return deps.createProvider(config);
  }

  /** The cloud credentials, which local mode never reads. */
  function cloudConfig(): { apiKey: string; baseUrl?: string } {
    const apiKey = deps.apiKey();
    if (deps.asrMode() !== "local" && apiKey.trim() === "") {
      // Mapped to 503 by the API error layer, like any unconfigured provider.
      throw new AiError("not-configured", "OPENAI_API_KEY is not set");
    }
    const baseUrl = deps.baseUrl();
    return { apiKey, ...(baseUrl === undefined ? {} : { baseUrl }) };
  }

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
      const provider = providerFor(cloudConfig());

      const mediaPath = await this.mediaPathFor(root);
      if (mediaPath === null) {
        throw new ProjectError("invalid-document", "project has no media");
      }

      const result = await provider.transcribe({ filePath: mediaPath });

      await saveTranscript(
        deps.fs,
        projectPaths(root).transcript,
        createTranscript(result.words),
      );

      return result.words.length;
    },

    async start(root: string): Promise<JobRecord> {
      const provider = providerFor(cloudConfig());

      const mediaPath = await this.mediaPathFor(root);
      if (mediaPath === null) {
        throw new ProjectError("invalid-document", "project has no media");
      }

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
