export type BatchProject = {
  name: string;
  root: string;
};

export type BatchOutcome = {
  root: string;
  status: string;
  detail?: string;
};

export type BatchDialogProps = {
  /** Projects in the folder being browsed, listed as checkboxes. */
  projects: readonly BatchProject[];
  selected: readonly string[];
  running: boolean;
  outcomes: readonly BatchOutcome[];
  onToggle: (root: string) => void;
  onStart: () => void;
  onClose: () => void;
};

/**
 * Transcribes several projects from the browsed folder.
 *
 * The list comes from the browser, so a batch never needs typed paths and
 * cannot point at a project the user has not seen.
 */
export function BatchDialog({
  projects,
  selected,
  running,
  outcomes,
  onToggle,
  onStart,
  onClose,
}: BatchDialogProps) {
  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Transcribe Several Projects"
      >
        <header className="picker-dialog__head">
          <h2>Transcribe Several Projects</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        {projects.length === 0 ? (
          <div className="browser__empty">
            <p>No Projects in This Folder</p>
            <p className="browser__hint">Open a folder with projects and try again.</p>
          </div>
        ) : (
          <fieldset className="batch-list">
            <legend>Projects</legend>
            {projects.map((project) => (
              <label key={project.root} className="batch-row">
                <input
                  type="checkbox"
                  aria-label={`Select ${project.name}`}
                  checked={selected.includes(project.root)}
                  onChange={() => onToggle(project.root)}
                />
                <span className="batch-row__name">{project.name}</span>
                <span className="batch-row__path" title={project.root}>
                  {project.root}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <footer className="picker-dialog__foot">
          <span className="muted">
            {selected.length} {selected.length === 1 ? "project" : "projects"} selected
          </span>
          <button
            type="button"
            className="button button--primary"
            onClick={onStart}
            disabled={selected.length === 0 || running}
          >
            {running ? "Transcribing…" : "Start Transcribe"}
          </button>
        </footer>

        {outcomes.length > 0 && (
          <ul className="outcomes" aria-label="Batch outcomes">
            {outcomes.map((outcome) => (
              <li key={outcome.root} data-status={outcome.status}>
                <span>{outcome.root}</span>
                <span className="muted">{outcome.status}</span>
                {outcome.detail !== undefined && (
                  <span className="muted">{outcome.detail}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
