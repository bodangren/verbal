import { Dialog } from "./Dialog";
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
  const folders = entries.filter((entry) => entry.kind !== "file");
  const files = entries.filter((entry) => entry.kind === "file");

  return (
    <Dialog
      open
      title="Import Media"
      onClose={onClose}
      footer={<span className="muted">Choosing a file imports a copy into the project.</span>}
    >
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
      </div>

      <p className="browser__path" title={path}>
        {path}
      </p>

      <div>
        {error !== null && (
          <>
            <p className="browser__error" role="alert">
              {error}
            </p>
            <p className="browser__hint">Use Home or Up to keep browsing.</p>
          </>
        )}

        {loading && <p className="browser__hint">Reading folder…</p>}

        {!loading && error === null && entries.length === 0 && (
          <div className="browser__empty">
            <p>No Media Files Here</p>
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
              title={`Import ${entry.name}`}
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
    </Dialog>
  );
}
