import type { JobRecord } from "@verbal/core/browser";
import { jobStatusText } from "./job-status";

export type ExportControlsProps = {
  disabled: boolean;
  reason?: string | null;
  job: JobRecord | null;
  onExport: () => void;
};

/** Export action with its prerequisite and the current job's status. */
export function ExportControls({
  disabled,
  reason = null,
  job,
  onExport,
}: ExportControlsProps) {
  const status = jobStatusText(job);

  return (
    <>
      <button
        type="button"
        className="button button--primary"
        onClick={onExport}
        disabled={disabled}
      >
        Export Storyboard
      </button>
      {reason !== null && <p className="muted">{reason}</p>}
      {status !== null && <p className="muted">{status}</p>}
    </>
  );
}
