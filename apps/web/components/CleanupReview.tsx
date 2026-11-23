import type { TranscriptDocument } from "@verbal/core/browser";
import {
  groupProposals,
  toggleCategory,
  toggleProposal,
  withAggressiveness,
  type Acceptance,
  type AudioFix,
  type CleanupProposal,
  type ProposalCategory,
} from "@verbal/cleanup";

const CATEGORY_LABEL: Record<ProposalCategory, string> = {
  stutter: "Stutter",
  filler: "Filler",
  "dead-air": "Dead air",
  "false-start": "False start",
  repetition: "Repetition",
};

function wordsFor(transcript: TranscriptDocument, proposal: CleanupProposal): string {
  return transcript.words
    .slice(proposal.fromIndex, proposal.toIndex + 1)
    .map((word) => word.text)
    .join(" ");
}

export type CleanupReviewProps = {
  transcript: TranscriptDocument;
  proposals: readonly CleanupProposal[];
  audioFixes: readonly AudioFix[];
  acceptance: Acceptance;
  onAcceptanceChange: (acceptance: Acceptance) => void;
  /** Omitted when freezing the master is not wired up yet; hides the control. */
  onFreeze?: () => void;
};

/**
 * Review surface for cleanup proposals.
 *
 * Nothing is removed automatically: each category and each proposal is a
 * decision, and the aggressiveness control only changes which proposals are
 * *eligible* for acceptance.
 */
export function CleanupReview({
  transcript,
  proposals,
  audioFixes,
  acceptance,
  onAcceptanceChange,
  onFreeze,
}: CleanupReviewProps) {
  const groups = groupProposals(proposals);

  return (
    <section className="cleanup" aria-label="Cleanup review">
      {audioFixes.length > 0 && (
        <div className="cleanup__audio">
          <h4>Audio Fixes</h4>
          <ul className="cleanup__audio-list">
            {audioFixes.map((fix) => (
              <li key={fix.id} className="cleanup__audio-fix" data-kind={fix.kind}>
                <span className="cleanup__badge">{fix.kind.toUpperCase()}</span>
                <span>{fix.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="cleanup__aggressiveness">
        Aggressiveness
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={acceptance.aggressiveness}
          onChange={(event) =>
            onAcceptanceChange(withAggressiveness(acceptance, Number(event.target.value)))
          }
        />
      </label>

      {groups.map((group) => (
        <article className="cleanup__group" key={group.category}>
          <header className="cleanup__group-header">
            <h4>{CATEGORY_LABEL[group.category]}</h4>
            <label className="cleanup__toggle">
              <input
                type="checkbox"
                aria-label={`Accept All ${group.category}`}
                checked={acceptance.categories.includes(group.category)}
                onChange={() => onAcceptanceChange(toggleCategory(acceptance, group.category))}
              />
              Accept All
            </label>
          </header>

          <ul className="cleanup__proposals">
            {group.proposals.map((proposal) => (
              <li
                key={proposal.id}
                className="cleanup__proposal"
                data-category={proposal.category}
              >
                <label className="cleanup__toggle">
                  <input
                    type="checkbox"
                    aria-label={`Accept Proposal ${proposal.id}`}
                    checked={acceptance.ids.includes(proposal.id)}
                    onChange={() => onAcceptanceChange(toggleProposal(acceptance, proposal.id))}
                  />
                  <s>{wordsFor(transcript, proposal)}</s>
                </label>
                <span className="cleanup__reason">{proposal.reason}</span>
                <span className="cleanup__confidence">
                  {Math.round(proposal.confidence * 100)}%
                </span>
                <span className="cleanup__cover">Cover: {proposal.cover}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}

      {onFreeze !== undefined && (
        <button type="button" className="cleanup__freeze" onClick={onFreeze}>
          Freeze Master
        </button>
      )}
    </section>
  );
}
