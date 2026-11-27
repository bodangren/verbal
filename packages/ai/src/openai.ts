import { promises as nodeFs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildChunkArgs,
  buildExtractArgs,
  DEFAULT_MAX_UPLOAD_BYTES,
  EXTRACT_BITRATE_KBPS,
  EXTRACT_EXTENSION,
  MAX_SPLIT_ROUNDS,
  planChunks,
  probeDurationSeconds,
  runExtract,
} from "./audio-extract";
import { nodeRun, type LocalRunner } from "./process";
import {
  AiError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type ProviderOptions,
  type SpokenWord,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type OpenAiConfig = {
  apiKey: string;
  baseUrl?: string;
  /** Injectable for tests. */
  fetch?: FetchLike;
  /** Injectable for tests; reads the extracted audio bytes, never the media. */
  readFile?: (path: string) => Promise<Uint8Array>;
  /** Injectable for tests; scratch-directory file operations. */
  fs?: {
    mkdtemp: (prefix: string) => Promise<string>;
    mkdir: (directory: string) => Promise<void>;
    rm: (
      directory: string,
      options?: { recursive?: boolean; force?: boolean },
    ) => Promise<void>;
  };
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function requireApiKey(apiKey: string): void {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new AiError("not-configured", "an API key is required");
  }
}

export function resolveBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWord(value: unknown): SpokenWord {
  if (!isRecord(value)) {
    throw new AiError("invalid-response", "word entry is not an object");
  }

  const text =
    typeof value.word === "string"
      ? value.word
      : typeof value.text === "string"
        ? value.text
        : undefined;

  if (text === undefined) {
    throw new AiError("invalid-response", "word entry has no text");
  }

  const start = typeof value.start === "number" ? value.start : Number.NaN;
  const end = typeof value.end === "number" ? value.end : Number.NaN;

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new AiError("invalid-response", "word entry has invalid timestamps");
  }

  return { text, start, end };
}

export type WhisperConfig = OpenAiConfig & {
  model?: string;
  /** ISO language sent with each upload when the request has none. */
  language?: string;
  /** Injectable ffmpeg runner for audio extraction; defaults to a real spawn. */
  run?: LocalRunner;
  /** Largest audio file sent in one upload; larger audio is split. */
  maxUploadBytes?: number;
  /** Injectable size lookup for the extracted audio. */
  stat?: (path: string) => Promise<{ size: number }>;
};

/**
 * Whisper transcription over the OpenAI-compatible audio endpoint.
 *
 * Uses `fetch` directly — no vendor SDK — so the adapter can point at any
 * compatible server by changing `baseUrl`. Audio is extracted locally to
 * compact mono 16 kHz MP3 before upload: video bytes never leave the machine,
 * and a large file is split into time chunks whose word times are re-based.
 */
export function createWhisperProvider(config: WhisperConfig): TranscriptionProvider {
  requireApiKey(config.apiKey);

  const doFetch = config.fetch ?? fetch;
  const readFile = config.readFile ?? (async (file: string) => nodeFs.readFile(file));
  const fs = config.fs ?? {
    mkdtemp: (prefix: string) => nodeFs.mkdtemp(prefix),
    mkdir: (directory: string) => nodeFs.mkdir(directory),
    rm: (
      directory: string,
      options?: { recursive?: boolean; force?: boolean },
    ) => nodeFs.rm(directory, options),
  };
  const run: LocalRunner = config.run ?? nodeRun;
  const stat = config.stat ?? ((file: string) => nodeFs.stat(file));
  const baseUrl = resolveBaseUrl(config.baseUrl);
  const model = config.model ?? "whisper-1";
  const maxUploadBytes = config.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;

  const postAudio = async (
    bytes: Uint8Array,
    filename: string,
    language: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<TranscriptionResult> => {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart]), filename);
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    if (language !== undefined) {
      form.append("language", language);
    }

    const response = await doFetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      ...(signal === undefined ? {} : { signal }),
    });

    if (!response.ok) {
      throw new AiError(
        "request-failed",
        `transcription failed with HTTP ${response.status}`,
        response.status,
      );
    }

    const data: unknown = await response.json();

    if (!isRecord(data) || !Array.isArray(data.words)) {
      throw new AiError("invalid-response", "transcription response has no words");
    }

    const words = (data.words as unknown[]).map(parseWord);

    return {
      text: typeof data.text === "string" ? data.text : "",
      language: typeof data.language === "string" ? data.language : null,
      words,
    };
  };

  const offsetWords = (result: TranscriptionResult, offset: number): TranscriptionResult => ({
    text: result.text,
    language: result.language,
    words: result.words.map((word) => ({
      ...word,
      start: word.start + offset,
      end: word.end + offset,
    })),
  });

  return {
    id: "openai-whisper",

    async transcribe(
      request,
      options?: ProviderOptions,
    ): Promise<TranscriptionResult> {
      const scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), "verbal-asr-"));
      const audioDir = path.join(scratchDir, "audio");
      const chunksDir = path.join(scratchDir, "chunks");
      const stem = path.parse(request.filePath).name || "audio";
      const audioPath = path.join(audioDir, `${stem}.${EXTRACT_EXTENSION}`);

      const cancelled = () => {
        if (options?.signal?.aborted === true) {
          throw new AiError("request-failed", "transcription cancelled");
        }
      };

      try {
        await fs.mkdir(audioDir);
        await fs.mkdir(chunksDir);

        await runExtract(run, buildExtractArgs(request.filePath, audioPath), {
          signal: options?.signal,
        });

        const durationSeconds = await probeDurationSeconds(run, audioPath, {
          signal: options?.signal,
        });
        const segments = planChunks(durationSeconds, maxUploadBytes, EXTRACT_BITRATE_KBPS);

        const results: TranscriptionResult[] = [];

        const uploadChunk = async (startSeconds: number, filePath: string) => {
          cancelled();
          const bytes = await readFile(filePath);
          const result = await postAudio(
            bytes,
            path.basename(filePath),
            request.language ?? config.language,
            options?.signal,
          );
          return offsetWords(result, startSeconds);
        };

        let nextIndex = 0;
        const cutSegment = async (
          startSeconds: number,
          durationSeconds: number,
          roundsLeft: number,
        ): Promise<{ startSeconds: number; path: string }[]> => {
          const index = nextIndex;
          nextIndex += 1;
          const chunkPath = path.join(chunksDir, `chunk-${index}.${EXTRACT_EXTENSION}`);
          await runExtract(
            run,
            buildChunkArgs(audioPath, chunkPath, startSeconds, durationSeconds),
            { signal: options?.signal },
          );
          const info = await stat(chunkPath);
          if (info.size <= maxUploadBytes) {
            return [{ startSeconds, path: chunkPath }];
          }
          if (roundsLeft <= 0) {
            throw new AiError(
              "request-failed",
              "a chunk still exceeds the upload limit after three splits",
            );
          }
          const half = durationSeconds / 2;
          const left = await cutSegment(startSeconds, half, roundsLeft - 1);
          const right = await cutSegment(startSeconds + half, half, roundsLeft - 1);
          return [...left, ...right];
        };

        if (segments.length === 1) {
          const segment = segments[0]!;
          const info = await stat(audioPath);
          if (info.size <= maxUploadBytes) {
            results.push(await uploadChunk(segment.startSeconds, audioPath));
          } else {
            const cuts = await cutSegment(
              segment.startSeconds,
              segment.durationSeconds,
              MAX_SPLIT_ROUNDS,
            );
            for (const cut of cuts) {
              results.push(await uploadChunk(cut.startSeconds, cut.path));
            }
          }
        } else {
          for (const segment of segments) {
            cancelled();
            const cuts = await cutSegment(
              segment.startSeconds,
              segment.durationSeconds,
              MAX_SPLIT_ROUNDS,
            );
            for (const cut of cuts) {
              results.push(await uploadChunk(cut.startSeconds, cut.path));
            }
          }
        }

        const words = results.flatMap((result) => result.words);
        const text = results.map((result) => result.text).filter(Boolean).join(" ");
        const language =
          results.find((result) => result.language !== null)?.language ?? null;

        return {
          text: text === "" ? words.map((word) => word.text).join(" ") : text,
          language,
          words,
        };
      } finally {
        await fs.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}

export type ChatConfig = OpenAiConfig & {
  model?: string;
};

/** Chat completion over the OpenAI-compatible endpoint. */
export function createChatProvider(config: ChatConfig): LlmProvider {
  requireApiKey(config.apiKey);

  const doFetch = config.fetch ?? fetch;
  const baseUrl = resolveBaseUrl(config.baseUrl);
  const model = config.model ?? "gpt-4o-mini";

  return {
    id: "openai-chat",

    async complete(request: LlmRequest, options?: ProviderOptions): Promise<LlmResult> {
      const messages: { role: string; content: string }[] = [];
      if (request.system !== undefined) {
        messages.push({ role: "system", content: request.system });
      }
      messages.push({ role: "user", content: request.prompt });

      const response = await doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        }),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      });

      if (!response.ok) {
        throw new AiError(
          "request-failed",
          `completion failed with HTTP ${response.status}`,
          response.status,
        );
      }

      const data: unknown = await response.json();
      const choices = isRecord(data) && Array.isArray(data.choices) ? data.choices : [];
      const first = choices[0];
      const message = isRecord(first) && isRecord(first.message) ? first.message : undefined;
      const text =
        message !== undefined && typeof message.content === "string"
          ? message.content
          : undefined;

      if (text === undefined) {
        throw new AiError("invalid-response", "completion response has no message content");
      }

      return {
        text,
        model: isRecord(data) && typeof data.model === "string" ? data.model : model,
      };
    },
  };
}
