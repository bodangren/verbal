import { describe, expect, it } from "vitest";
import type { TakeAlignment } from "./align";
import { splitBeats } from "./beats";
import { buildReviewPrompt, parseReviewResponse } from "./review";

const beats = splitBeats("Hello world. This is a test.");
const alignment: TakeAlignment = {
  beats: [
    {
      beatId: "b0",
      index: 0,
      status: "good",
      coverage: 1,
      confidence: 1,
      startSeconds: 0,
      endSeconds: 2,
      spokeText: "hello world",
    },
    {
      beatId: "b1",
      index: 1,
      status: "bungled",
      coverage: 0.5,
      confidence: 0.5,
      startSeconds: 2.5,
      endSeconds: 4,
      spokeText: "this is a",
    },
  ],
};

describe("parseReviewResponse", () => {
  it("keeps valid proposals in beat order", () => {
    const raw = JSON.stringify({
      beats: [
        { id: "b0", action: "keep", reason: "clean" },
        {
          id: "b1",
          action: "reread",
          reason: "fluffed",
          source: { startSeconds: 2.5, endSeconds: 4 },
        },
      ],
    });

    const result = parseReviewResponse(raw, beats, 10);

    expect(result.proposals[0]).toMatchObject({ beatId: "b0", action: "keep" });
    expect(result.proposals[1]).toMatchObject({
      beatId: "b1",
      action: "reread",
      startSeconds: 2.5,
      endSeconds: 4,
    });
  });

  it("falls back to keep for unknown ids, bad actions, and bad ranges", () => {
    const raw = JSON.stringify({
      beats: [
        { id: "b9", action: "cut", source: { startSeconds: 0, endSeconds: 1 } },
        { id: "b0", action: "delete", source: { startSeconds: 0, endSeconds: 1 } },
        { id: "b1", action: "cut", source: { startSeconds: 4, endSeconds: 20 } },
      ],
    });

    const result = parseReviewResponse(raw, beats, 10);

    expect(result.proposals.map((proposal) => proposal.action)).toEqual(["keep", "keep"]);
  });

  it("drops overlapping ranges in script order", () => {
    const raw = JSON.stringify({
      beats: [
        { id: "b0", action: "cut", source: { startSeconds: 0, endSeconds: 5 } },
        { id: "b1", action: "reread", source: { startSeconds: 4, endSeconds: 6 } },
      ],
    });

    const result = parseReviewResponse(raw, beats, 10);

    expect(result.proposals[0]).toMatchObject({ action: "cut", startSeconds: 0 });
    expect(result.proposals[1]).toMatchObject({ action: "keep" });
  });

  it("returns all-keep for malformed JSON", () => {
    const result = parseReviewResponse("{nope", beats, 10);
    expect(result.proposals.map((proposal) => proposal.action)).toEqual(["keep", "keep"]);
  });
});

describe("buildReviewPrompt", () => {
  it("names each beat's status and the take words", () => {
    const prompt = buildReviewPrompt(beats, alignment, [
      { text: "hello", start: 0, end: 0.5 },
    ]);

    expect(prompt).toContain("b0 [good 100%]");
    expect(prompt).toContain("b1 [bungled 50%]");
    expect(prompt).toContain("hello@0.00-0.50");
  });
});
