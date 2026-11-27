export type StatusBarProps = {
  jobText: string;
  mediaLabel: string;
  message: string | null;
  error: { message: string; detail?: string } | null;
};

/** Status line for the job, media, and the latest message. */
export function StatusBar({ jobText, mediaLabel, message, error }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className="statusbar__item">{jobText}</span>
      <span className="statusbar__item">{mediaLabel}</span>
      <span
        className={`statusbar__message${error !== null ? " is-error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {error?.message ?? message ?? ""}
      </span>
      {error?.detail ? (
        <details className="statusbar__error">
          <summary tabIndex={0}>{error.message}</summary>
          <pre className="statusbar__detail">{error.detail}</pre>
        </details>
      ) : null}
    </footer>
  );
}
