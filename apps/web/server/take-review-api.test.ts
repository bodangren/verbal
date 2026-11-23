import type { LlmProvider } from "@verbal/ai";
import { describe, expect, it, vi } from "vitest";
import { createTakeReviewApi, estimateReview, type TakeReviewApiDeps } from "./take-review-api";

const script = "Hello world. This is a test.";
const words = [
  { text: "hello", start: 0, end: 0.5 },
  { text: "world", start: 0.5, end: 1 },
  { text: "this", start: 1.5, end: 2 },
  { text: "is", start: 2, end: 2.5 },
  { text: "a", start: 2.5, end: 2.8 },
  { text: "test", start: 2.8, end: 3.2 },
];

function setup(overrides: Partial<TakeReviewApiDeps> = {}) {
  const complete = vi.fn(async () => ({
    text: JSON.stringify({
      beats: [
        {
          id: "b1",
          action: "reread",
          reason: "fluffed",
          source: { startSeconds: 1.5, endSeconds: 3.2 },
        },
      ],
    }),
    model: "fake",
  }));
  const llm: LlmProvider = { id: "fake", complete };
  const api = createTakeReviewApi({
    readScript: async () => script,
    readTranscript: async () => ({ words }),
    llm: () => llm,
    ...overrides,
  });
  return { api, complete };
}

describe("take review api", () => {
  it("previews the provider and cost without calling the model", async () => {
    const { api, complete } = setup();

    const response = await api.preview({ root: "/p", takeId: "take-1" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      provider: "fake",
      estimate: { tokens: expect.any(Number), cost: expect.any(Number) },
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("requires confirmation before calling the model", async () => {
    const { api, complete } = setup();

    const response = await api.review({
      root: "/p",
      takeId: "take-1",
      confirm: false,
    });

    expect(response.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it("returns validated proposals after confirmation", async () => {
    const { api, complete } = setup();

    const response = await api.review({
      root: "/p",
      takeId: "take-1",
      confirm: true,
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      provider: "fake",
      model: "fake",
      proposals: [
        { beatId: "b0", action: "keep" },
        { beatId: "b1", action: "reread" },
      ],
    });
  });

  it("falls back to keep when the model returns malformed JSON", async () => {
    const complete = vi.fn(async () => ({ text: "not json", model: "fake" }));
    const api = createTakeReviewApi({
      readScript: async () => script,
      readTranscript: async () => ({ words }),
      llm: () => ({ id: "fake", complete }),
    });

    const response = await api.review({
      root: "/p",
      takeId: "take-1",
      confirm: true,
    });

    const body = response.body as { proposals: { action: string }[] };
    expect(body.proposals.every((proposal) => proposal.action === "keep")).toBe(true);
  });

  it("returns 404 when the take has no transcript", async () => {
    const api = createTakeReviewApi({
      readScript: async () => script,
      readTranscript: async () => null,
      llm: () => ({ id: "fake", complete: vi.fn() }),
    });

    expect(
      (
        await api.review({ root: "/p", takeId: "take-1", confirm: true })
      ).status,
    ).toBe(404);
  });

  it("estimates a positive cost for a real prompt", () => {
    const estimate = estimateReview("x".repeat(4000));
    expect(estimate.tokens).toBe(1000);
    expect(estimate.cost).toBeCloseTo(0.002);
  });
});
