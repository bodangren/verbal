import type { ProjectSummary } from "@verbal/core/browser";

export type ProjectPickerProps = {
  folder: string;
  projects: readonly ProjectSummary[];
  /** True once a scan has finished, so an empty list means "none here". */
  scanned: boolean;
  scanning?: boolean;
  error?: string | null;
  onFolderChange: (folder: string) => void;
  onScan: () => void;
  onOpen: (root: string) => void;
  /** `stage` leads the empty workspace; `rail` is the compact side panel. */
  variant?: "stage" | "rail";
};

function relativeDay(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) {
    return "unknown date";
  }

  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(then).toISOString().slice(0, 10);
}

/**
 * Lists the projects in a folder so one can be opened with a click.
 *
 * The folder is remembered by the caller, which is what makes this a picker
 * rather than another path field: a returning user sees their projects without
 * typing an absolute path.
 */
export function ProjectPicker({
  folder,
  projects,
  scanned,
  scanning = false,
  error = null,
  onFolderChange,
  onScan,
  onOpen,
  variant = "stage",
}: ProjectPickerProps) {
  return (
    <section className={`picker picker--${variant}`} aria-label="Project picker">
      <h2>{variant === "stage" ? "Open a project" : "Projects"}</h2>

      <label className="field">
        Projects folder
        <input
          value={folder}
          onChange={(event) => onFolderChange(event.target.value)}
          placeholder="/home/you/Verbal"
          spellCheck={false}
        />
      </label>

      <div className="row">
        <button type="button" onClick={onScan} disabled={folder.trim() === "" || scanning}>
          {scanning ? "Scanning…" : "Scan folder"}
        </button>
      </div>

      {error !== null && <p className="status status--error">{error}</p>}

      {projects.length > 0 ? (
        <ul className="picker__list" aria-label="Projects">
          {projects.map((project) => (
            <li key={project.root} className="picker__item">
              <div className="picker__meta">
                <span className="picker__name">{project.name}</span>
                <span className="muted">
                  {project.transcriptWords} words · {project.hasMedia ? "media" : "no media"} ·{" "}
                  {relativeDay(project.createdAt)}
                </span>
                <span className="picker__path" title={project.root}>
                  {project.root}
                </span>
              </div>
              <button type="button" onClick={() => onOpen(project.root)}>
                Open {project.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" role={scanned ? undefined : "note"}>
          {scanned
            ? "No projects in that folder. Create one from the Project panel, or point at another folder."
            : "Point at a folder to list the projects inside it."}
        </p>
      )}
    </section>
  );
}
