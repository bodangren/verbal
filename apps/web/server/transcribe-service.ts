import fs from "node:fs";
import path from "node:path";
import {
  createLocalWhisperProvider,
  createTyphoonProvider,
  createWhisperProvider,
  AiError,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "@verbal/ai";
import {
  ProjectError,
  computeMediaRevision,
  createTranscript,
  mediaRevisionMismatch,
  nodeFileSystem,
  openProject,
  projectPaths,
  resolveMediaPath,
  saveProject,
  saveTranscript,
  type FileSystem,
  type JobRecord,
  type JobRegistry,
  type MediaRevisionStat,
} from "@verbal/core";
import { resolveAsr, type AsrResolution } from "./asr-resolve";
import { getJobRegistry, verbalDataDir } from "./registry";
import { withProjectLock } from "./project-lock";
import { runTranscriptionJob } from "./transcribe-job";
import { stat as statFile } from "node:fs/promises";

/** What the UI says about the provider the environment selected. */
export type TranscriptionProviderInfo = {
  mode: "local" | "cloud" | "none";
  label: string;
  /** True when audio leaves the machine. */
  cloud: boolean;
  /** A next step when no speech engine is set up. */
  hint?: string;
};

/**
 * Names the transcription provider for the UI.
 *
 * The resolver chooses the provider; this only describes the choice, so the
 * stage can say where the audio goes before the user transcribes.
 */
export function describeTranscriptionProvider(resolved: AsrResolution): TranscriptionProviderInfo {
  if (resolved.mode === "local") {
    return {
      mode: "local",
      label: `Local (whisper ${resolved.modelName})`,
      cloud: false,
    };
  }
  if (resolved.mode === "typhoon") {
    return {
      mode: "local",
      label: "Local (Typhoon ASR, Thai)",
      cloud: false,
    };
  }
  if (resolved.mode === "cloud") {
    return { mode: "cloud", label: "Cloud (OpenAI-compatible)", cloud: true };
  }
  return {
    mode: "none",
    label: "No speech engine",
    cloud: false,
    hint: "Install whisper (see README, Transcription setup), run npm run fetch:typhoon, or set OPENAI_API_KEY.",
  };
}

/** Files and PATH entries are read here; the resolver itself stays pure. */
export function resolveSystemAsr(env: NodeJS.ProcessEnv = process.env): AsrResolution {
  return resolveAsr({
    dataDir: verbalDataDir(env),
    env,
    exists: (candidate) => fs.existsSync(candidate),
    list: (dir) => {
      try {
        return fs.readdirSync(dir);
      } catch {
        return [];
      }
    },
    onPath: (name) =>
      (env.PATH ?? "")
        .split(path.delimiter)
        .some((dir) => dir !== "" && fs.existsSync(path.join(dir, name))),
  });
}

/** The provider description served by /api/system. */
export function systemTranscriptionInfo(): TranscriptionProviderInfo {
  return describeTranscriptionProvider(resolveSystemAsr());
}

export type TranscribeServiceDeps = {
  fs: FileSystem;
  registry: () => Promise<JobRegistry>;
  apiKey: () => string;
  baseUrl: () => string | undefined;
  createProvider: (config: {
    apiKey: string;
    baseUrl?: string;
    language?: string;
  }) => TranscriptionProvider;
  resolveAsr: () => AsrResolution;
  dataDir: () => string;
  createLocalProvider: (config: {
    modelPath: string;
    binary?: string;
    language?: string;
  }) => TranscriptionProvider;
  createTyphoonProvider: (config: { modelDir: string }) => TranscriptionProvider;
  stat: (mediaPath: string) => Promise<MediaRevisionStat>;
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
    resolveAsr: () => resolveSystemAsr(),
    dataDir: () => verbalDataDir(),
    createLocalProvider: (config) => createLocalWhisperProvider(config),
    createTyphoonProvider: (config) => createTyphoonProvider(config),
    stat: async (mediaPath) => {
      const info = await statFile(mediaPath);
      return { size: info.size, mtimeMs: info.mtimeMs };
    },
    ...overrides,
  };

  /** Builds the provider the resolver selected. */
  function providerFor(): TranscriptionProvider {
    const resolved = deps.resolveAsr();

    if (resolved.mode === "none") {
      throw new AiError(
        "not-configured",
        `no speech engine is set up: run npm run fetch:typhoon, install whisper-cli and a model in ${deps.dataDir()}, or set OPENAI_API_KEY`,
      );
    }

    if (resolved.mode === "typhoon") {
      return deps.createTyphoonProvider({ modelDir: resolved.modelDir });
    }

    if (resolved.mode === "local") {
      return deps.createLocalProvider({
        modelPath: resolved.modelPath,
        binary: resolved.binary,
        language: resolved.language,
      });
    }

    const apiKey = deps.apiKey();
    if (apiKey.trim() === "") {
      // Mapped to 503 by the API error layer, like any unconfigured provider.
      throw new AiError("not-configured", "OPENAI_API_KEY is not set");
    }
    const baseUrl = deps.baseUrl();
    return deps.createProvider({
      apiKey,
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(resolved.language === undefined ? {} : { language: resolved.language }),
    });
  }

  /**
   * Resolves the media path and returns the revision the transcription starts
   * from. A project without a revision is stamped first, so a later import
   * that writes a new revision is detected as a mismatch.
   */
  async function startingRevision(root: string): Promise<{
    mediaPath: string;
    startRevision: string;
  }> {
    return withProjectLock(root, async () => {
      const startProject = await openProject(deps.fs, root);
      const mediaPath = resolveMediaPath(startProject, root);
      if (mediaPath === null) {
        throw new ProjectError("invalid-document", "project has no media");
      }

      const media = startProject.media;
      if (media === undefined) {
        throw new ProjectError("invalid-document", "project has no media");
      }

      const existing = media.mediaRevision;
      if (existing !== undefined) {
        return { mediaPath, startRevision: existing };
      }

      const startRevision = await computeMediaRevision({ mediaPath, stat: deps.stat });
      await saveProject(deps.fs, root, {
        ...startProject,
        media: { ...media, mediaRevision: startRevision },
      });
      return { mediaPath, startRevision };
    });
  }

  /**
   * Re-reads the project, drops a stale result, and stamps the transcript.
   *
   * The revision is recorded at start and checked again before the save, so a
   * media import that lands mid-transcription invalidates the result.
   */
  async function saveStampedTranscript(
    root: string,
    startRevision: string,
    result: TranscriptionResult,
  ): Promise<number> {
    return withProjectLock(root, async () => {
      const currentProject = await openProject(deps.fs, root);
      const currentRevision = currentProject.media?.mediaRevision;

      if (mediaRevisionMismatch(startRevision, currentRevision)) {
        throw new Error("transcription is stale: media changed during transcription");
      }

      await saveTranscript(
        deps.fs,
        projectPaths(root).transcript,
        { ...createTranscript(result.words), mediaRevision: startRevision },
      );

      return result.words.length;
    });
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
    /** Builds the provider the environment selects, for a non-project file. */
    provider(): TranscriptionProvider {
      return providerFor();
    },

    async transcribeNow(root: string, signal?: AbortSignal, jobId?: string): Promise<number> {
      if (signal?.aborted) throw new Error("transcription cancelled");
      const provider = providerFor();

      const { mediaPath, startRevision } = await startingRevision(root);

      const result = await provider.transcribe(
        { filePath: mediaPath },
        signal === undefined ? undefined : { signal },
      );

      if (signal?.aborted) throw new Error("transcription cancelled");

      const save = () => saveStampedTranscript(root, startRevision, result);

      if (jobId === undefined) {
        return save();
      }

      const registry = await deps.registry();
      if (!registry.beginPublish(jobId)) {
        throw new Error("transcription cancelled");
      }
      try {
        return await save();
      } finally {
        registry.endPublish(jobId);
      }
    },

    async start(root: string): Promise<JobRecord> {
      const provider = providerFor();

      const { mediaPath, startRevision } = await startingRevision(root);

      const registry = await deps.registry();
      const job = await registry.create("transcribe");
      const signal = registry.signalOf(job.id);
      if (signal === undefined) throw new Error(`job ${job.id} has no abort signal`);
      let lastPercent = -1;
      let pending = Promise.resolve();

      const onProgress = (fraction: number): void => {
        const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
        if (percent <= lastPercent) {
          return;
        }
        lastPercent = percent;
        // The job runner writes 0 with "Extracting audio…". The provider reports
        // 0.05 once the audio exists, so any value from there on is the engine.
        const message = fraction < 0.05 ? "Extracting audio…" : "Transcribing audio…";
        pending = pending
          .then(async () => {
            await registry.progress(job.id, fraction, message);
          })
          .catch(() => undefined);
      };

      void runTranscriptionJob({
        registry,
        jobId: job.id,
        provider,
        request: { filePath: mediaPath },
        onProgress,
        flushProgress: () => pending,
        onTranscript: async (result) => {
          await saveStampedTranscript(root, startRevision, result);
        },
      });

      return job;
    },
  };
}
