import type { LlmProvider } from "@verbal/ai";
import { ProjectError } from "@verbal/core";
import {
  alignTake,
  buildReviewPrompt,
  parseReviewResponse,
  REVIEW_SYSTEM,
  splitBeats,
} from "@verbal/takes";
import { failure } from "./api-errors";
import type { ApiResponse } from "./jobs-api";
import { normalizeTakeId } from "./take-api";
import type { TakeTranscript } from "./take-transcript";
import { asRecord, requireAbsolutePath } from "./validation";

/** Local placeholder price; the UI shows it before any call. */
const PRICE_PER_1K_TOKENS = 0.002;

export type TakeReviewApiDeps = {
  readScript: (root: string) => Promise<string>;
  readTranscript: (root: string, takeId: string) => Promise<TakeTranscript | null>;
  llm: () => LlmProvider;
};

export function estimateReview(prompt: string): { tokens: number; cost: number } {
  const tokens = Math.ceil(prompt.length / 4);
  return {
    tokens,
    cost: Number(((tokens / 1000) * PRICE_PER_1K_TOKENS).toFixed(4)),
  };
}

async function prepare(deps: TakeReviewApiDeps, input: Record<string, unknown>) {
  const root = requireAbsolutePath(input.root, "root");
  const takeId = normalizeTakeId(input.takeId);
  const script = await deps.readScript(root);
  const transcript = await deps.readTranscript(root, takeId);
  if (transcript === null) {
    throw new ProjectError("not-found", "that take has no transcript yet");
  }

  const beats = splitBeats(script);
  const alignment = alignTake(beats, transcript.words);
  const prompt = buildReviewPrompt(beats, alignment, transcript.words);
  const durationSeconds = transcript.words.reduce(
    (max, word) => Math.max(max, word.end),
    0,
  );
  return { root, takeId, beats, prompt, durationSeconds };
}

/**
 * The LLM's first-pass edit review.
 *
 * `preview` names the provider and estimates the cost without a call. `review`
 * requires `confirm: true`, then validates the model's JSON against the script.
 */
export function createTakeReviewApi(deps: TakeReviewApiDeps) {
  return {
    async preview(input: unknown): Promise<ApiResponse> {
      try {
        const prepared = await prepare(deps, asRecord(input));
        const provider = deps.llm();
        return {
          status: 200,
          body: {
            provider: provider.id,
            estimate: estimateReview(prepared.prompt),
          },
        };
      } catch (error) {
        return failure(error);
      }
    },

    async review(input: unknown): Promise<ApiResponse> {
      try {
        const body = asRecord(input);
        if (body.confirm !== true) {
          return {
            status: 400,
            body: { error: "confirm the provider and cost first" },
          };
        }

        const prepared = await prepare(deps, body);
        const provider = deps.llm();
        const result = await provider.complete({
          prompt: prepared.prompt,
          system: REVIEW_SYSTEM,
          temperature: 0,
        });
        const parsed = parseReviewResponse(
          result.text,
          prepared.beats,
          prepared.durationSeconds,
        );

        return {
          status: 200,
          body: {
            provider: provider.id,
            model: result.model,
            proposals: parsed.proposals,
          },
        };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
