export type ScriptEditorProps = {
  script: string;
  words: number;
  readTime: string;
  onScriptChange: (text: string) => void;
  onUseTranscript: () => void;
  onOpenStudio: () => void;
};

/**
 * The persistent script editor in Ingest.
 *
 * Authoring belongs on the page, not behind the Studio overlay: the user can
 * write or paste a script, pull in the transcript, then open the Studio to
 * prompt from it.
 */
export function ScriptEditor({
  script,
  words,
  readTime,
  onScriptChange,
  onUseTranscript,
  onOpenStudio,
}: ScriptEditorProps) {
  return (
    <section className="card" aria-label="Script">
      <div className="studio__head">
        <h3>Script</h3>
        <span className="muted">{words} words</span>
        <span className="muted">{readTime} read</span>
        <span className="studio__actions">
          <button type="button" className="button button--ghost" onClick={onUseTranscript}>
            Use Transcript
          </button>
          <button type="button" className="button button--primary" onClick={onOpenStudio}>
            Open Studio
          </button>
        </span>
      </div>
      <textarea
        className="editor studio__script"
        aria-label="Script"
        value={script}
        onChange={(event) => onScriptChange(event.target.value)}
        placeholder="Write or paste the script you will read…"
        spellCheck={false}
      />
    </section>
  );
}
