import {
  AiError,
  type ProviderOptions,
} from "./types";
import {
  requireApiKey,
  resolveBaseUrl,
  type OpenAiConfig,
} from "./openai";

export type ImageRequest = {
  prompt: string;
  width?: number;
  height?: number;
  model?: string;
  seed?: number;
};

export type GeneratedImage = {
  data: Uint8Array;
  mediaType: string;
  model: string;
  prompt: string;
};

/** Text-to-image provider. Implementations live only in this package. */
export interface ImageProvider {
  readonly id: string;
  /** Estimated cost of one image, in US dollars. */
  estimateCost(request: ImageRequest): number;
  generate(request: ImageRequest, options?: ProviderOptions): Promise<GeneratedImage>;
}

export type ImageConfig = OpenAiConfig & {
  model?: string;
  costPerImage?: number;
};

const DEFAULT_MODEL = "gpt-image-1";
const DEFAULT_COST = 0.04;
const MAX_SIZE = 2048;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Image generation over the OpenAI-compatible images endpoint.
 *
 * `estimateCost` never touches the network: the caller shows the price before
 * deciding to generate.
 */
export function createOpenAiImageProvider(config: ImageConfig): ImageProvider {
  requireApiKey(config.apiKey);

  const doFetch = config.fetch ?? fetch;
  const baseUrl = resolveBaseUrl(config.baseUrl);
  const defaultModel = config.model ?? DEFAULT_MODEL;
  const cost = config.costPerImage ?? DEFAULT_COST;

  return {
    id: "openai-image",

    estimateCost: () => cost,

    async generate(request: ImageRequest, options?: ProviderOptions): Promise<GeneratedImage> {
      const prompt = typeof request.prompt === "string" ? request.prompt.trim() : "";

      if (prompt === "") {
        throw new AiError("invalid-request", "prompt is required");
      }

      const width = request.width ?? 1024;
      const height = request.height ?? 1024;

      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width < 1 ||
        height < 1 ||
        width > MAX_SIZE ||
        height > MAX_SIZE
      ) {
        throw new AiError("invalid-request", "image size must be between 1 and 2048");
      }

      const model = request.model ?? defaultModel;

      const response = await doFetch(`${baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: `${width}x${height}`,
          response_format: "b64_json",
          ...(request.seed === undefined ? {} : { seed: request.seed }),
        }),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      });

      if (!response.ok) {
        throw new AiError(
          "request-failed",
          `image generation failed with HTTP ${response.status}`,
          response.status,
        );
      }

      const data: unknown = await response.json();
      const first = isRecord(data) && Array.isArray(data.data) ? data.data[0] : undefined;
      const encoded = isRecord(first) && typeof first.b64_json === "string" ? first.b64_json : undefined;

      if (encoded === undefined) {
        throw new AiError("invalid-response", "image response has no b64_json");
      }

      return {
        data: Uint8Array.from(Buffer.from(encoded, "base64")),
        mediaType: "image/png",
        model,
        prompt,
      };
    },
  };
}
