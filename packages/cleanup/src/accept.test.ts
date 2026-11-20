import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCEPTANCE,
  resolveAccepted,
  toggleCategory,
  toggleProposal,
  withAggressiveness,
} from "./accept";
import type { CleanupProposal, ProposalCategory } from "./types";

function proposal(
  id: string,
  category: ProposalCategory,
  confidence: number,
): CleanupProposal {
  return {
    id,
    category,
    fromIndex: 0,
    toIndex: 0,
    confidence,
    reason: id,
    cover: "punch-in",
  };
}

const PROPOSALS = [
  proposal("a", "filler", 0.9),
  proposal("b", "filler", 0.6),
  proposal("c", "dead-air", 0.95),
];

describe("resolveAccepted", () => {
  it("accepts nothing by default", () => {
    expect(resolveAccepted(PROPOSALS, DEFAULT_ACCEPTANCE)).toEqual([]);
  });

  it("accepts a whole category", () => {
    const acceptance = { ...DEFAULT_ACCEPTANCE, categories: ["filler" as ProposalCategory] };

    expect(resolveAccepted(PROPOSALS, acceptance).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("accepts an individual proposal", () => {
    const acceptance = { ...DEFAULT_ACCEPTANCE, ids: ["c"] };

    expect(resolveAccepted(PROPOSALS, acceptance).map((entry) => entry.id)).toEqual(["c"]);
  });

  it("applies aggressiveness as a confidence threshold", () => {
    const categories = ["filler" as ProposalCategory];

    expect(
      resolveAccepted(PROPOSALS, { categories, ids: [], aggressiveness: 0.2 }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["a"]);

    expect(
      resolveAccepted(PROPOSALS, { categories, ids: [], aggressiveness: 0.6 }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("clamps aggressiveness to 0..1", () => {
    expect(withAggressiveness(DEFAULT_ACCEPTANCE, -1).aggressiveness).toBe(0);
    expect(withAggressiveness(DEFAULT_ACCEPTANCE, 4).aggressiveness).toBe(1);
  });
});

describe("toggles", () => {
  it("adds and removes a category", () => {
    const added = toggleCategory(DEFAULT_ACCEPTANCE, "filler");
    expect(added.categories).toEqual(["filler"]);

    expect(toggleCategory(added, "filler").categories).toEqual([]);
  });

  it("adds and removes a proposal id", () => {
    const added = toggleProposal(DEFAULT_ACCEPTANCE, "a");
    expect(added.ids).toEqual(["a"]);

    expect(toggleProposal(added, "a").ids).toEqual([]);
  });

  it("does not mutate the input", () => {
    const original = { ...DEFAULT_ACCEPTANCE };

    toggleCategory(original, "filler");
    toggleProposal(original, "a");
    withAggressiveness(original, 0.9);

    expect(original).toEqual(DEFAULT_ACCEPTANCE);
  });
});
