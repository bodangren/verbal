import { useEffect, useRef } from "react";
import type { JobRecord } from "@verbal/core/browser";
import { jobResultText, jobStartText, jobStatusText } from "./job-status";

export type ExportControlsProps = {
  disabled: boolean;
  reason?: string | null;
  job: JobRecord | null;
  onExport: () => void;
  running?: boolean;
  progressPercent?: number;
  onPreview?: (() => void) | null;
  previewDisabled?: boolean;
  onAnnounce?: (message: string) => void;
};

const noAnnounce = () => {};

/** Export action with its busy state and the current job's status. */
export function ExportControls({
  disabled,
  reason = null,
  job,
  onExport,
  running = false,
  progressPercent,
  onPreview = null,
  previewDisabled = false,
  onAnnounce = noAnnounce,
}: ExportControlsProps) {
  const status = jobStatusText(job);
  const percent = progressPercent ?? (job === null ? 0 : Math.round(job.progress * 100));
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (job === null) {
      announced.current = null;
      return;
    }

    const key = `${job.id}:${job.status}`;
    if (announced.current === key) {
      return;
    }
    announced.current = key;

    const text = jobStartText(job) ?? jobResultText(job);
    if (text !== null) {
      onAnnounce(text);
    }
  }, [job, onAnnounce]);

  return (
    <>
      <button
        type="button"
        className="button button--primary"
        onClick={onExport}
        disabled={disabled || running}
      >
        {running ? "Exporting…" : "Export Video"}
      </button>
      {onPreview !== null && (
        <button
          type="button"
          className="button button--ghost"
          onClick={onPreview}
          disabled={previewDisabled || running}
        >
          {running ? "Rendering…" : "Preview"}
        </button>
      )}
      {running && <progress aria-label="Export progress" value={percent} max={100} />}
      {reason !== null && <p className="muted">{reason}</p>}
      {status !== null && !running && <p className="muted">{status}</p>}
    </>
  );
}
