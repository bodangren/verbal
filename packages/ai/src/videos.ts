import { AiError, type ProviderOptions } from "./types";
import { requireApiKey, resolveBaseUrl, type OpenAiConfig } from "./openai";

export type VideoRequest = {
  prompt: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  model?: string;
  seed?: number;
};

export type GeneratedVideo = {
  data: Uint8Array;
  mediaType: string;
  model: string;
  prompt: string;
};

/** Text-to-video provider. Implementations live only in this package. */
export interface VideoProvider {
  readonly id: string;
  /** Estimated cost in US dollars; local, never a network call. */
  estimateCost(request: VideoRequest): number;
  generate(request: VideoRequest, options?: ProviderOptions): Promise<GeneratedVideo>;
}

export type VideoConfig = OpenAiConfig & {
  model?: string;
  costPerSecond?: number;
  minimumCost?: number;
};

const DEFAULT_MODEL = "sora-1";
const DEFAULT_COST_PER_SECOND = 0.1;
const DEFAULT_MINIMUM = 0.25;
const MAX_DURATION = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Video generation over an OpenAI-compatible endpoint.
 *
 * The interface is intentionally one call. A real provider that submits and
 * polls can implement the same method; the job registry owns progress and
 * cancellation either way.
 */
export function createOpenAiVideoProvider(config: VideoConfig): VideoProvider {
  requireApiKey(config.apiKey);

  const doFetch = config.fetch ?? fetch;
  const baseUrl = resolveBaseUrl(config.baseUrl);
  const defaultModel = config.model ?? DEFAULT_MODEL;
  const costPerSecond = config.costPerSecond ?? DEFAULT_COST_PER_SECOND;
  const minimumCost = config.minimumCost ?? DEFAULT_MINIMUM;

  return {
    id: "openai-video",

    estimateCost(request) {
      const seconds = Number.isFinite(request.durationSeconds) ? request.durationSeconds : 0;
      return Math.max(minimumCost, seconds * costPerSecond);
    },

    async generate(request: VideoRequest, options?: ProviderOptions): Promise<GeneratedVideo> {
      const prompt = typeof request.prompt === "string" ? request.prompt.trim() : "";

      if (prompt === "") {
        throw new AiError("invalid-request", "prompt is required");
      }

      const duration = request.durationSeconds;
      if (!Number.isFinite(duration) || duration < 1 || duration > MAX_DURATION) {
        throw new AiError("invalid-request", "durationSeconds must be between 1 and 60");
      }

      const width = request.width ?? 1280;
      const height = request.height ?? 720;
      const model = request.model ?? defaultModel;

      const response = await doFetch(`${baseUrl}/videos/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          duration,
          size: `${width}x${height}`,
          response_format: "b64_json",
          ...(request.seed === undefined ? {} : { seed: request.seed }),
        }),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      });

      if (!response.ok) {
        throw new AiError(
          "request-failed",
          `video generation failed with HTTP ${response.status}`,
          response.status,
        );
      }

      const data: unknown = await response.json();
      const first = isRecord(data) && Array.isArray(data.data) ? data.data[0] : undefined;
      const encoded = isRecord(first) && typeof first.b64_json === "string" ? first.b64_json : undefined;

      if (encoded === undefined) {
        throw new AiError("invalid-response", "video response has no b64_json");
      }

      return {
        data: Uint8Array.from(Buffer.from(encoded, "base64")),
        mediaType: "video/mp4",
        model,
        prompt,
      };
    },
  };
}
