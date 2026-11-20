import {
  DEFAULT_ACCEPTANCE,
  type Acceptance,
  type CleanupProposal,
  type ProposalCategory,
} from "./types";

export { DEFAULT_ACCEPTANCE };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Aggressiveness maps to a confidence threshold: 0 requires certainty, 1 accepts anything. */
export function thresholdFor(aggressiveness: number): number {
  return 1 - clamp(aggressiveness, 0, 1);
}

export function isEnabled(proposal: CleanupProposal, acceptance: Acceptance): boolean {
  return (
    acceptance.categories.includes(proposal.category) || acceptance.ids.includes(proposal.id)
  );
}

/**
 * The proposals an acceptance setting actually removes.
 *
 * A proposal must be enabled (by category or id) and must clear the
 * aggressiveness threshold.
 */
export function resolveAccepted(
  proposals: readonly CleanupProposal[],
  acceptance: Acceptance,
): CleanupProposal[] {
  const threshold = thresholdFor(acceptance.aggressiveness);

  return proposals.filter(
    (proposal) => isEnabled(proposal, acceptance) && proposal.confidence >= threshold,
  );
}

export function toggleCategory(
  acceptance: Acceptance,
  category: ProposalCategory,
): Acceptance {
  const categories = acceptance.categories.includes(category)
    ? acceptance.categories.filter((entry) => entry !== category)
    : [...acceptance.categories, category];

  return { ...acceptance, categories };
}

export function toggleProposal(acceptance: Acceptance, id: string): Acceptance {
  const ids = acceptance.ids.includes(id)
    ? acceptance.ids.filter((entry) => entry !== id)
    : [...acceptance.ids, id];

  return { ...acceptance, ids };
}

export function withAggressiveness(acceptance: Acceptance, value: number): Acceptance {
  return { ...acceptance, aggressiveness: clamp(value, 0, 1) };
}
