export type StatusBarProps = {
  jobText: string;
  mediaLabel: string;
  message: string | null;
  error: { message: string; detail?: string } | null;
};

/** Status line for the job, media, and the latest message. */
export function StatusBar({ jobText, mediaLabel, message, error }: StatusBarProps) {
  const liveText = error?.message ?? message ?? "";
  // The summary already shows the same words, so the live copy stays for
  // assistive technology only.
  const shownElsewhere =
    liveText !== "" && (jobText === liveText || (error !== null && Boolean(error.detail)));

  return (
    <footer className="statusbar">
      <span className="statusbar__item">{jobText}</span>
      <span className="statusbar__item">{mediaLabel}</span>
      <span
        className={`statusbar__message${error !== null ? " is-error" : ""}${
          shownElsewhere ? " sr-only" : ""
        }`}
        role="status"
        aria-live="polite"
      >
        {error?.message ?? message ?? ""}
      </span>
      {error?.detail ? (
        <details className="statusbar__error statusbar__error--popover">
          <summary tabIndex={0}>Error: {error.message}</summary>
          <pre className="statusbar__detail">{error.detail}</pre>
        </details>
      ) : null}
    </footer>
  );
}
