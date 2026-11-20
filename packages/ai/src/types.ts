/** A word produced by an ASR provider, before ids are assigned. */
export type SpokenWord = {
  text: string;
  start: number;
  end: number;
};

export type TranscriptionRequest = {
  filePath: string;
  language?: string;
};

export type TranscriptionResult = {
  text: string;
  language: string | null;
  words: SpokenWord[];
};

export type ProviderOptions = {
  signal?: AbortSignal;
};

/** Speech-to-text provider. Implementations live only in this package. */
export type TranscriptionProvider = {
  readonly id: string;
  transcribe(
    request: TranscriptionRequest,
    options?: ProviderOptions,
  ): Promise<TranscriptionResult>;
};

export type LlmRequest = {
  prompt: string;
  system?: string;
  temperature?: number;
};

export type LlmResult = {
  text: string;
  model: string;
};

/** Text-completion provider. Implementations live only in this package. */
export type LlmProvider = {
  readonly id: string;
  complete(request: LlmRequest, options?: ProviderOptions): Promise<LlmResult>;
};

export type AiErrorCode = "not-configured" | "request-failed" | "invalid-response";

/** Error raised by a provider adapter. */
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly status?: number;

  constructor(code: AiErrorCode, message: string, status?: number) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = status;
  }
}
