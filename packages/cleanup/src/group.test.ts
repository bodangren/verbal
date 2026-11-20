import { describe, expect, it } from "vitest";
import { groupProposals } from "./group";
import type { CleanupProposal, ProposalCategory } from "./types";

function proposal(id: string, category: ProposalCategory): CleanupProposal {
  return {
    id,
    category,
    fromIndex: 0,
    toIndex: 0,
    confidence: 0.8,
    reason: id,
    cover: "punch-in",
  };
}

describe("groupProposals", () => {
  it("groups by category in a fixed order", () => {
    const groups = groupProposals([
      proposal("a", "filler"),
      proposal("b", "dead-air"),
      proposal("c", "filler"),
    ]);

    expect(groups.map((group) => group.category)).toEqual(["filler", "dead-air"]);
    expect(groups[0]?.proposals.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(groups[1]?.proposals.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("omits empty categories", () => {
    const groups = groupProposals([proposal("a", "stutter")]);

    expect(groups).toEqual([
      {
        category: "stutter",
        proposals: [proposal("a", "stutter")],
      },
    ]);
  });

  it("returns nothing for no proposals", () => {
    expect(groupProposals([])).toEqual([]);
  });
});
