import { useEffect, useRef } from "react";
import type { FsEntry } from "../server/fs-api";

export type MediaPickerProps = {
  /** Folder currently being browsed. */
  path: string;
  parent: string | null;
  entries: readonly FsEntry[];
  loading?: boolean;
  error?: string | null;
  onChoose: (path: string) => void;
  onClose: () => void;
  onHome: () => void;
  onNavigate: (path: string) => void;
  onUp: () => void;
};

/**
 * Picks a media file by walking the filesystem.
 *
 * The importer used to require an absolute path typed from memory. This dialog
 * reuses the same folder listing as the project browser, with media files added
 * when `includeFiles` is requested, so a take can be chosen by clicking.
 */
export function MediaPicker({
  path,
  parent,
  entries,
  loading = false,
  error = null,
  onChoose,
  onClose,
  onHome,
  onNavigate,
  onUp,
}: MediaPickerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const folders = entries.filter((entry) => entry.kind !== "file");
  const files = entries.filter((entry) => entry.kind === "file");

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
        ref={dialogRef}
        className="picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Choose media file"
        tabIndex={-1}
      >
        <header className="picker-dialog__head">
          <h2>Choose media</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="browser__nav">
          <button
            type="button"
            className="icon-button"
            aria-label="Go up one folder"
            title="Up one folder"
            onClick={onUp}
            disabled={parent === null}
          >
            ↑
          </button>
          <button type="button" className="button button--ghost" onClick={onHome}>
            Home
          </button>
        </div>

        <p className="browser__path" title={path}>
          {path}
        </p>

        <div className="picker-dialog__list">
          {error !== null && (
            <>
              <p className="browser__error" role="alert">
                {error}
              </p>
              <p className="browser__hint">Use Home or Up to keep browsing.</p>
            </>
          )}

          {loading && (
            <p className="browser__hint" role="status">
              Reading folder…
            </p>
          )}

          {!loading && error === null && entries.length === 0 && (
            <div className="browser__empty">
              <p>No media files here</p>
              <p className="browser__hint">Go up, or choose another folder.</p>
            </div>
          )}

          {folders.map((entry) => (
            <div key={entry.path} className="entry">
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

          {files.length > 0 && <p className="browser__section">Media</p>}
          {files.map((entry) => (
            <div key={entry.path} className="entry">
              <button
                type="button"
                className="entry__main"
                onClick={() => onChoose(entry.path)}
                title={`Choose ${entry.name}`}
              >
                <span className="entry__glyph" aria-hidden="true">
                  ▶
                </span>
                <span className="entry__text">
                  <span className="entry__name">{entry.name}</span>
                </span>
              </button>
            </div>
          ))}
        </div>

        <footer className="picker-dialog__foot">
          <span className="muted">Only media files are listed.</span>
        </footer>
      </div>
    </div>
  );
}
