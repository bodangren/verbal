/** Why a word span was proposed for removal. */
export const PROPOSAL_CATEGORIES = [
  "stutter",
  "filler",
  "dead-air",
  "false-start",
  "repetition",
] as const;

export type ProposalCategory = (typeof PROPOSAL_CATEGORIES)[number];

/** Suggested visual treatment for the jump cut a deletion creates. */
export type VisualCover = "punch-in" | "cutaway" | "slide" | "none";

export type CleanupProposal = {
  id: string;
  category: ProposalCategory;
  /** Inclusive word index range. */
  fromIndex: number;
  toIndex: number;
  /** 0..1; how sure the detector is. */
  confidence: number;
  reason: string;
  cover: VisualCover;
};

export type AudioFixKind = "hum" | "rumble" | "level";

export type AudioFix = {
  id: string;
  kind: AudioFixKind;
  reason: string;
};

export type Acceptance = {
  /** Categories accepted wholesale. */
  categories: ProposalCategory[];
  /** Individual proposal ids accepted. */
  ids: string[];
  /** 0 = conservative, 1 = aggressive. */
  aggressiveness: number;
};

export const DEFAULT_ACCEPTANCE: Acceptance = {
  categories: [],
  ids: [],
  aggressiveness: 0.5,
};
