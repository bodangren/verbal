import type { FsEntry } from "../server/fs-api";

export type ProjectBrowserProps = {
  /** Folder currently being browsed. */
  path: string;
  entries: readonly FsEntry[];
  loading?: boolean;
  error?: string | null;
  onCreate?: (name: string) => void;
  onHome: () => void;
  onNavigate: (path: string) => void;
  onOpen: (path: string) => void;
  onUp: () => void;
  parent: string | null;
};

function baseName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length === 0 ? "/" : (parts[parts.length - 1] ?? "/");
}

/**
 * Browses folders on the machine so a project can be opened by clicking.
 *
 * Every entry is a button: a project opens, a plain folder enters. Nothing here
 * asks for a typed path, which is the whole point — a local editor should let
 * you walk to your work the way a file manager does.
 */
export function ProjectBrowser({
  path,
  entries,
  loading = false,
  error = null,
  onHome,
  onNavigate,
  onOpen,
  onUp,
  parent,
}: ProjectBrowserProps) {
  return (
    <section className="browser" aria-label="Project browser">
      <header className="browser__bar">
        <button type="button" onClick={onUp} disabled={parent === null}>
          Up
        </button>
        <button type="button" onClick={onHome}>
          Home
        </button>
        <span className="browser__path" title={path}>
          {path}
        </span>
      </header>

      {error !== null && <p className="status status--error">{error}</p>}
      {loading && <p className="muted">Reading folder…</p>}

      {entries.length === 0 && !loading ? (
        <p className="muted">
          Nothing to browse here. Use Up to go back, or Home to start from your home folder.
        </p>
      ) : (
        <ul className="browser__list" aria-label="Folders">
          {entries.map((entry) => (
            <li key={entry.path} className="browser__item" data-project={entry.isProject ? "true" : undefined}>
              <span className="browser__name">{entry.name}</span>
              {entry.isProject ? (
                <span className="browser__actions">
                  <button type="button" onClick={() => onOpen(entry.path)}>
                    Open {entry.name}
                  </button>
                  <button type="button" onClick={() => onNavigate(entry.path)}>
                    Enter {entry.name}
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => onNavigate(entry.path)}>
                  Enter {entry.name}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="muted browser__current">Browsing {baseName(path)}</p>
    </section>
  );
}
