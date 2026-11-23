import { splitBeats } from "@verbal/takes";
import { Teleprompter } from "./Teleprompter";

export type StudioStageProps = {
  script: string;
  words: number;
  readTime: string;
  offsetWords: number;
  wpm: number;
  fontSize: number;
  mirror: boolean;
  playing: boolean;
  reducedMotion?: boolean;
  dimmedBeatIds?: readonly string[];
  onScriptChange: (text: string) => void;
  onUseTranscript: () => void;
  onTogglePlay: () => void;
  onWpmChange: (wpm: number) => void;
  onFontSizeChange: (size: number) => void;
  onToggleMirror: () => void;
  onReset: () => void;
};

/**
 * The Studio: the script editor and the prompter.
 *
 * Phase 1 is script and prompter only; the camera preview and capture controls
 * join this surface in Phase 2.
 */
export function StudioStage({
  script,
  words,
  readTime,
  offsetWords,
  wpm,
  fontSize,
  mirror,
  playing,
  reducedMotion = false,
  dimmedBeatIds,
  onScriptChange,
  onUseTranscript,
  onTogglePlay,
  onWpmChange,
  onFontSizeChange,
  onToggleMirror,
  onReset,
}: StudioStageProps) {
  return (
    <section className="studio" aria-label="Script and Prompter">
      <div className="studio__editor">
        <div className="studio__head">
          <h3>Script</h3>
          <span className="muted">{words} words</span>
          <span className="muted">{readTime} read</span>
          <button type="button" className="button button--ghost" onClick={onUseTranscript}>
            Use Transcript
          </button>
        </div>
        <textarea
          className="editor studio__script"
          aria-label="Script"
          value={script}
          onChange={(event) => onScriptChange(event.target.value)}
          placeholder="Write or paste the script you will read…"
          spellCheck={false}
        />
      </div>

      <Teleprompter
        beats={splitBeats(script)}
        offsetWords={offsetWords}
        wpm={wpm}
        fontSize={fontSize}
        mirror={mirror}
        playing={playing}
        reducedMotion={reducedMotion}
        dimmedBeatIds={dimmedBeatIds}
        onTogglePlay={onTogglePlay}
        onWpmChange={onWpmChange}
        onFontSizeChange={onFontSizeChange}
        onToggleMirror={onToggleMirror}
        onReset={onReset}
      />
    </section>
  );
}
