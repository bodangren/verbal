import { useRef } from "react";
import type { Beat, BeatStatus, TakeAlignment } from "@verbal/takes";

export type TakeReviewProps = {
  beats: readonly Beat[];
  alignment: TakeAlignment;
  /** The take's media URL, when it can be played beside the review. */
  takeUrl?: string;
  onReread: (beatId: string) => void;
  onStatusChange: (beatId: string, status: BeatStatus) => void;
  onSeek: (seconds: number) => void;
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
    </section>
  );
}
