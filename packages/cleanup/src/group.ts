import { PROPOSAL_CATEGORIES, type CleanupProposal } from "./types";

export type ProposalGroup = {
  category: CleanupProposal["category"];
  proposals: CleanupProposal[];
};

/** Groups proposals by category, in the canonical category order. */
export function groupProposals(proposals: readonly CleanupProposal[]): ProposalGroup[] {
  return PROPOSAL_CATEGORIES.map((category) => ({
    category,
    proposals: proposals.filter((proposal) => proposal.category === category),
  })).filter((group) => group.proposals.length > 0);
}
