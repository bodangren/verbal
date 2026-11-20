import path from "node:path";
import { promises as nodeFs } from "node:fs";
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
  /** Injectable for tests; defaults to reading the file from disk. */
  readFile?: (path: string) => Promise<Uint8Array>;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function requireApiKey(apiKey: string): void {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new AiError("not-configured", "an API key is required");
  }
}

function resolveBaseUrl(baseUrl: string | undefined): string {
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
};

/**
 * Whisper transcription over the OpenAI-compatible audio endpoint.
 *
 * Uses `fetch` directly — no vendor SDK — so the adapter can point at any
 * compatible server by changing `baseUrl`.
 */
export function createWhisperProvider(config: WhisperConfig): TranscriptionProvider {
  requireApiKey(config.apiKey);

  const doFetch = config.fetch ?? fetch;
  const readFile = config.readFile ?? (async (file: string) => nodeFs.readFile(file));
  const baseUrl = resolveBaseUrl(config.baseUrl);
  const model = config.model ?? "whisper-1";

  return {
    id: "openai-whisper",

    async transcribe(
      request,
      options?: ProviderOptions,
    ): Promise<TranscriptionResult> {
      const bytes = await readFile(request.filePath);

      const form = new FormData();
      form.append("file", new Blob([bytes as BlobPart]), path.basename(request.filePath));
      form.append("model", model);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      if (request.language !== undefined) {
        form.append("language", request.language);
      }

      const response = await doFetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
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
