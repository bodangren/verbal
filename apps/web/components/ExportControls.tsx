import { useEffect, useRef } from "react";
import type { JobRecord } from "@verbal/core/browser";
import { errorCopyFor } from "../lib/error-copy";
import { jobOutputPath, jobResultText, jobStartText, jobStatusText } from "./job-status";

export type ExportControlsProps = {
  disabled: boolean;
  reason?: string | null;
  job: JobRecord | null;
  /** A failed export request, shown in the same slot as a failed job. */
  requestError?: { message: string; detail?: string } | null;
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
  requestError = null,
  onExport,
  running = false,
  progressPercent,
  onPreview = null,
  previewDisabled = false,
  onAnnounce = noAnnounce,
}: ExportControlsProps) {
  const status = jobStatusText(job);
  const percent = progressPercent ?? (job === null ? 0 : Math.round(job.progress * 100));
  const failed = job !== null && job.status === "failed";
  const done = job !== null && job.status === "done";
  const outputPath = job !== null && done ? jobOutputPath(job) : null;
  const fileName =
    outputPath === null ? null : (outputPath.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? null);
  const failure =
    requestError ?? (failed && job !== null ? errorCopyFor(job.error) : null);
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (job === null) {
      announced.current = null;
      return;
    }

    // One start announcement per job: queued to running must not repeat.
    const started = jobStartText(job);
    const key = started !== null ? `start:${job.id}` : `${job.id}:${job.status}`;
    if (announced.current === key) {
      return;
    }
    announced.current = key;

    const text = started ?? jobResultText(job);
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
          Preview
        </button>
      )}
      {running && (
        <div className="export-busy">
          <span className="export-busy__label">Exporting · {percent}%</span>
          <progress aria-label="Export progress" value={percent} max={100} />
        </div>
      )}
      {reason !== null && <p className="muted">{reason}</p>}
      {failure !== null && (
        <div className="pane-alert export-error" role="alert">
          <p className="pane-alert__message">{failure.message}</p>
          <details className="export-error__detail">
            <summary>Error detail</summary>
            <pre className="pane-alert__detail">{failure.detail}</pre>
          </details>
        </div>
      )}
      {done && (
        <p className="muted export-done">
          Export finished
          {outputPath !== null && fileName !== null ? (
            <>
              : <strong>{fileName}</strong> <span className="export-done__path">{outputPath}</span>
            </>
          ) : null}
        </p>
      )}
      {status !== null && !running && !failed && !done && <p className="muted">{status}</p>}
    </>
  );
}
