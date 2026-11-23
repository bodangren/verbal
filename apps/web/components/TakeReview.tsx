import { useRef } from "react";
import type { Beat, BeatProposal, BeatStatus, TakeAlignment } from "@verbal/takes";

export type ReviewProposalView = BeatProposal & {
  selected: boolean;
};

export type TakeReviewLlm = {
  provider: string | null;
  estimate: { tokens: number; cost: number } | null;
  proposals: readonly ReviewProposalView[];
  running: boolean;
  onPreview: () => void;
  onRun: () => void;
  onToggle: (beatId: string) => void;
  onApply: () => void;
  onDismiss: () => void;
};

export type TakeReviewProps = {
  beats: readonly Beat[];
  alignment: TakeAlignment;
  /** The take's media URL, when it can be played beside the review. */
  takeUrl?: string;
  onReread: (beatId: string) => void;
  onStatusChange: (beatId: string, status: BeatStatus) => void;
  onSeek: (seconds: number) => void;
  llm?: TakeReviewLlm;
  cut?: { ranges: number; durationSeconds: number; building: boolean };
  onBuildCut?: () => void;
};

const STATUS_LABELS: Record<BeatStatus, string> = {
  good: "Good",
  bungled: "Bungled",
  skipped: "Skipped",
  improvised: "Improvised",
};

function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "—";
  }
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The script-vs-take review.
 *
 * Each beat shows its status, coverage, and source time. A bungled, skipped,
 * or improvised beat offers Reread; the status can be overridden by hand.
 */
export function TakeReview({
  beats,
  alignment,
  takeUrl,
  onReread,
  onStatusChange,
  onSeek,
  llm,
  cut,
  onBuildCut,
}: TakeReviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  function seek(seconds: number | null) {
    if (seconds === null) {
      return;
    }
    if (videoRef.current !== null) {
      videoRef.current.currentTime = seconds;
    }
    onSeek(seconds);
  }

  return (
    <section className="take-review" aria-label="Take Review">
      {takeUrl !== undefined && (
        <video
          ref={videoRef}
          className="take-review__video"
          src={takeUrl}
          controls
          preload="metadata"
        />
      )}
      {llm !== undefined && (
        <div className="take-review__llm">
          <div className="toolbar">
            <button
              type="button"
              className="button button--ghost"
              onClick={llm.onPreview}
              disabled={llm.running}
            >
              Suggest Edits
            </button>
            {llm.provider !== null && llm.estimate !== null && (
              <span className="muted">
                {llm.provider} · ~{llm.estimate.tokens} tokens · ~$
                {llm.estimate.cost.toFixed(4)}
              </span>
            )}
            {llm.provider !== null && llm.proposals.length === 0 && (
              <button
                type="button"
                className="button button--primary"
                onClick={llm.onRun}
                disabled={llm.running}
              >
                {llm.running ? "Reviewing…" : "Run Review"}
              </button>
            )}
          </div>

          {llm.proposals.length > 0 && (
            <>
              <ul className="take-review__proposals" aria-label="Suggested edits">
                {llm.proposals.map((proposal) => (
                  <li key={proposal.beatId}>
                    <label>
                      <input
                        type="checkbox"
                        checked={proposal.selected}
                        onChange={() => llm.onToggle(proposal.beatId)}
                      />
                      <span>
                        {proposal.beatId} · {proposal.action} · {proposal.reason}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="toolbar">
                <button type="button" className="button button--primary" onClick={llm.onApply}>
                  Apply Selected
                </button>
                <button type="button" className="button button--ghost" onClick={llm.onDismiss}>
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <ul className="take-review__beats">
        {beats.map((beat, index) => {
          const item = alignment.beats[index];
          if (item === undefined) {
            return null;
          }
          return (
            <li key={beat.id} className="take-review__beat" data-status={item.status}>
              <button
                type="button"
                className="take-review__seek"
                onClick={() => seek(item.startSeconds)}
              >
                <span className="take-review__time">{formatTime(item.startSeconds)}</span>
                <span className="take-review__text">{beat.text}</span>
              </button>
              <span className="take-review__status">{STATUS_LABELS[item.status]}</span>
              <span className="muted">{Math.round(item.coverage * 100)}%</span>
              <label className="take-review__override">
                <span className="sr-only">Status for {beat.id}</span>
                <select
                  value={item.status}
                  onChange={(event) =>
                    onStatusChange(beat.id, event.target.value as BeatStatus)
                  }
                >
                  {(Object.keys(STATUS_LABELS) as BeatStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              {item.status !== "good" && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => onReread(beat.id)}
                >
                  Reread
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {onBuildCut !== undefined && (
        <div className="take-review__cut">
          <button
            type="button"
            className="button button--ghost"
            onClick={onBuildCut}
            disabled={cut?.building === true}
          >
            {cut?.building === true ? "Building…" : "Build Cut"}
          </button>
          {cut !== undefined && cut.ranges > 0 && (
            <span className="muted">
              {cut.ranges} {cut.ranges === 1 ? "range" : "ranges"} ·{" "}
              {formatTime(cut.durationSeconds)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
