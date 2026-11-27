export type WorkspaceMode = "ingest" | "edit" | "deliver";

export type SaveState = "none" | "saving" | "unsaved" | "saved";

const MODES: readonly { id: WorkspaceMode; label: string }[] = [
  { id: "ingest", label: "Ingest" },
  { id: "edit", label: "Edit" },
  { id: "deliver", label: "Export" },
];

const SAVE_LABEL: Record<SaveState, string> = {
  none: "No transcript",
  saving: "Saving…",
  unsaved: "Unsaved",
  saved: "Saved",
};

export type TopBarProps = {
  projectName: string | null;
  projectRoot: string;
  mode: WorkspaceMode;
  saveState: SaveState;
  onMode: (mode: WorkspaceMode) => void;
  onExport: () => void;
};

/**
 * The window's top bar: identity, current project, modes, save state, Export.
 *
 * The save dot is visible text, not a live region; the status bar owns async
 * announcements. Export is always one click away, even from Edit.
 */
export function TopBar({
  projectName,
  projectRoot,
  mode,
  saveState,
  onMode,
  onExport,
}: TopBarProps) {
  return (
    <header className="bar">
      <div className="bar__brand">
        <span className="bar__mark" aria-hidden="true">
          V
        </span>
        <span className="bar__wordmark">Verbal</span>
      </div>

      <div className="bar__document">
        {projectName === null ? (
          <span className="bar__document-empty">No Project Open</span>
        ) : (
          <>
            <span className="bar__document-name">{projectName}</span>
            <span className="bar__document-path" title={projectRoot}>
              {projectRoot}
            </span>
          </>
        )}
      </div>

      <nav className="segmented" aria-label="Workspace mode">
        {MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="segmented__option"
            aria-current={mode === entry.id ? "page" : undefined}
            tabIndex={mode === entry.id ? 0 : -1}
            onClick={() => onMode(entry.id)}
            onKeyDown={(event) => {
              const index = MODES.findIndex((item) => item.id === entry.id);
              const nextIndex =
                event.key === "ArrowRight" ? (index + 1) % MODES.length :
                event.key === "ArrowLeft" ? (index + MODES.length - 1) % MODES.length :
                event.key === "Home" ? 0 :
                event.key === "End" ? MODES.length - 1 : -1;
              if (nextIndex < 0) return;
              event.preventDefault();
              const next = MODES[nextIndex]!;
              onMode(next.id);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>("button")[nextIndex]
                ?.focus();
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="bar__actions">
        <span className="bar__save" data-state={saveState}>
          <span className="bar__save-dot" aria-hidden="true" />
          {SAVE_LABEL[saveState]}
        </span>
        <button
          type="button"
          className="button button--primary bar__export"
          onClick={onExport}
        >
          Export
        </button>
      </div>
    </header>
  );
}
