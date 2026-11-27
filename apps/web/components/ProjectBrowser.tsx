import { useState, useSyncExternalStore, type FormEvent } from "react";
import type { FsEntry } from "../server/fs-api";

export type ProjectBrowserProps = {
  /** Folder currently being browsed. */
  path: string;
  entries: readonly FsEntry[];
  loading?: boolean;
  error?: string | null;
  onCreate: (name: string) => void;
  onHome: () => void;
  onNavigate: (path: string) => void;
  onOpen: (path: string) => void;
  onUp: () => void;
  parent: string | null;
  /** Root of the open project, marked as the current row. */
  currentRoot?: string;
};

const COLLAPSE_KEY = "verbal.browser.collapsed";

const collapseListeners = new Set<() => void>();
/** Used only when storage is unavailable, so the rail still toggles. */
let collapsedFallback: boolean | null = null;

function readCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    if (stored !== null) {
      return stored === "true";
    }
  } catch {
    // Storage can be unavailable; fall through to the fallback and the viewport rule.
  }
  if (collapsedFallback !== null) {
    return collapsedFallback;
  }
  return (
    typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1100px)").matches
  );
}

function subscribeCollapsed(listener: () => void): () => void {
  collapseListeners.add(listener);
  // The default depends on the viewport, so a live resize re-reads it.
  const query =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 1100px)")
      : undefined;
  query?.addEventListener?.("change", listener);
  return () => {
    collapseListeners.delete(listener);
    query?.removeEventListener?.("change", listener);
  };
}

function writeCollapsed(next: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, String(next));
  } catch {
    // The rail still works without storage; the choice just will not persist.
    collapsedFallback = next;
  }
  for (const listener of [...collapseListeners]) {
    listener();
  }
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }

  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest}s`;
}

function countWords(summary: FsEntry["summary"]): string {
  if (summary === undefined) {
    return "No transcript";
  }
  if (summary.transcriptWords === 0) {
    return "No transcript";
  }
  return `${summary.transcriptWords.toLocaleString()} ${
    summary.transcriptWords === 1 ? "word" : "words"
  }`;
}

function relativeDay(createdAt: string): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return "";
  }

  const days = Math.round((Date.now() - created.getTime()) / 86_400_000);
  if (days <= 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 30) {
    return `${days} days ago`;
  }

  return created.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Browses folders on the machine so a project can be opened by clicking.
 *
 * Project rows open; plain folder rows enter. Creating a project happens in the
 * folder being browsed, so a folder is never typed. This is the only way into
 * the app — there is no path field anywhere.
 */
export function ProjectBrowser({
  path,
  entries,
  loading = false,
  error = null,
  onCreate,
  onHome,
  onNavigate,
  onOpen,
  onUp,
  parent,
  currentRoot,
}: ProjectBrowserProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  // The server render is always expanded. The client reads storage and the
  // viewport through an external store, so hydration matches and no effect
  // has to set state.
  const storedCollapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const hasProject = currentRoot !== undefined && currentRoot !== "";
  // The browser stays open while no project is open.
  const isCollapsed = hasProject && storedCollapsed;

  function toggleCollapsed() {
    writeCollapsed(!storedCollapsed);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      return;
    }
    onCreate(trimmed);
    setName("");
    setCreating(false);
  }

  if (isCollapsed) {
    // At narrow widths the rail becomes a strip: the open project stays
    // named and one Projects button brings the full list back in place.
    const current = entries.find((entry) => entry.path === currentRoot);
    const currentName = current?.summary?.name ?? current?.name ?? currentRoot ?? "";
    return (
      <div className="browser browser--collapsed">
        <button
          type="button"
          className="icon-button browser__rail-button"
          aria-label="Expand Project Browser"
          title="Expand Project Browser"
          onClick={toggleCollapsed}
        >
          ▸
        </button>
        <span className="browser__current" title={currentRoot ?? undefined}>
          {currentName}
        </span>
        <button
          type="button"
          className="button button--ghost browser__strip-button"
          onClick={toggleCollapsed}
          aria-expanded="false"
        >
          Projects
        </button>
      </div>
    );
  }

  const projects = entries.filter((entry) => entry.isProject);
  const folders = entries.filter((entry) => !entry.isProject);

  return (
    <div className="browser">
      <header className="browser__header">
        <div className="browser__nav">
          <button
            type="button"
            className="icon-button"
            aria-label="Go Up One Folder"
            title="Up one folder"
            onClick={onUp}
            disabled={parent === null}
          >
            ↑
          </button>
          <button type="button" className="button button--ghost" onClick={onHome}>
            Home
          </button>
          <button
            type="button"
            className="icon-button browser__collapse"
            aria-label="Collapse Project Browser"
            title="Collapse Project Browser"
            onClick={toggleCollapsed}
          >
            ‹
          </button>
        </div>
        <p className="browser__path" title={path}>
          {path}
        </p>
      </header>

      <div
        className="browser__list"
        role="list"
        aria-label="Folders and projects"
        aria-busy={loading}
      >
        {error !== null && (
          <p className="browser__error" role="alert">
            {error}
          </p>
        )}

        {loading && <p className="browser__hint">Reading folder…</p>}

        {!loading && error === null && entries.length === 0 && (
          <div className="browser__empty">
            <p>No folders here</p>
            <p className="browser__hint">Use Up to go back, or create a project below.</p>
          </div>
        )}

        {projects.length > 0 && <p className="browser__section">Projects</p>}
        {projects.map((entry) => (
          <div
            key={entry.path}
            className={`entry entry--project${entry.path === currentRoot ? " entry--current" : ""}`}
            role="listitem"
            aria-current={entry.path === currentRoot ? "true" : undefined}
          >
            <button
              type="button"
              className="entry__main"
              onClick={() => onOpen(entry.path)}
              title={`Open ${entry.name}`}
            >
              <span className="entry__glyph" aria-hidden="true">
                ●
              </span>
              <span className="entry__text">
                <span className="entry__name">{entry.summary?.name ?? entry.name}</span>
                <span className="entry__meta">
                  {countWords(entry.summary)}
                  {formatDuration(entry.summary?.durationSeconds) !== ""
                    ? ` · ${formatDuration(entry.summary?.durationSeconds)}`
                    : ""}
                  {entry.summary?.hasMedia === true ? " · Media" : " · No media"}
                  {entry.summary ? ` · ${relativeDay(entry.summary.createdAt)}` : ""}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="button button--primary entry__open"
              onClick={() => onOpen(entry.path)}
            >
              Open
            </button>
          </div>
        ))}

        {folders.length > 0 && <p className="browser__section">Folders</p>}
        {folders.map((entry) => (
          <div key={entry.path} className="entry" role="listitem">
            <button
              type="button"
              className="entry__main"
              onClick={() => onNavigate(entry.path)}
              title={`Enter ${entry.name}`}
            >
              <span className="entry__glyph entry__glyph--folder" aria-hidden="true">
                ▸
              </span>
              <span className="entry__text">
                <span className="entry__name">{entry.name}</span>
              </span>
            </button>
          </div>
        ))}
      </div>

      <footer className="browser__footer">
        {creating ? (
          <form className="browser__new" onSubmit={submit}>
            <label className="sr-only" htmlFor="new-project-name">
              New Project Name
            </label>
            <input
              id="new-project-name"
              autoComplete="off"
              autoFocus
              placeholder="Project name…"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setCreating(false);
                  setName("");
                }
              }}
            />
            <button type="submit" className="button button--primary" disabled={name.trim() === ""}>
              Create
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setCreating(false);
                setName("");
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="button button--ghost browser__new-button"
            onClick={() => setCreating(true)}
          >
            + New Project Here
          </button>
        )}
      </footer>
    </div>
  );
}
