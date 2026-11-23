import { describePatch, type StoryboardPatch } from "@verbal/storyboard";

export type PatchReviewProps = {
  patches: readonly StoryboardPatch[];
  accepted: readonly boolean[];
  onToggle: (index: number) => void;
  onApply: () => void;
  onReject: () => void;
};

/**
 * Review surface for a proposed set of storyboard patches.
 *
 * Each patch is one hunk: nothing is applied unless it is selected, and the
 * caller decides when to commit the selection.
 */
export function PatchReview({
  patches,
  accepted,
  onToggle,
  onApply,
  onReject,
}: PatchReviewProps) {
  const selected = accepted.filter(Boolean).length;

  return (
    <section className="patches" aria-label="Patch review">
      <header className="patches__header">
        <h2>Proposed changes</h2>
        <span className="patches__count">
          {selected} of {patches.length} selected
        </span>
      </header>

      <ol className="patches__list">
        {patches.map((patch, index) => (
          <li
            key={`${index}-${patch.type}`}
            className="patches__item"
            data-accepted={accepted[index] === true ? "true" : "false"}
          >
            <label className="patches__hunk">
              <input
                type="checkbox"
                aria-label={`Toggle hunk ${index + 1}`}
                checked={accepted[index] === true}
                onChange={() => onToggle(index)}
              />
              <span>{describePatch(patch)}</span>
            </label>
          </li>
        ))}
      </ol>

      <div className="patches__actions">
        <button type="button" className="patches__apply" onClick={onApply}>
          Apply Selected
        </button>
        <button type="button" className="patches__discard" onClick={onReject}>
          Discard
        </button>
      </div>
    </section>
  );
}
