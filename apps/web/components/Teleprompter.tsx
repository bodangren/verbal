import type { CSSProperties, KeyboardEvent } from "react";
import type { Beat } from "@verbal/takes";
import {
  clampFontSize,
  clampWpm,
  FONT_STEP,
  LINE_HEIGHT_EM,
  lineForWord,
  offsetPixels,
  WPM_STEP,
  WORDS_PER_LINE,
} from "./prompter-clock";

export type TeleprompterProps = {
  beats: readonly Beat[];
  offsetWords: number;
  wpm: number;
  fontSize: number;
  mirror: boolean;
  playing: boolean;
  reducedMotion?: boolean;
  dimmedBeatIds?: readonly string[];
  onTogglePlay: () => void;
  onWpmChange: (wpm: number) => void;
  onFontSizeChange: (size: number) => void;
  onToggleMirror: () => void;
  onReset: () => void;
};

/**
 * The top-center prompter.
 *
 * The scrolling text is decorative (`aria-hidden`); the script textarea in the
 * Studio is the accessible copy. Controls and scoped keys drive the parent,
 * which owns the clock and the offset.
 */
export function Teleprompter({
  beats,
  offsetWords,
  wpm,
  fontSize,
  mirror,
  playing,
  reducedMotion = false,
  dimmedBeatIds = [],
  onTogglePlay,
  onWpmChange,
  onFontSizeChange,
  onToggleMirror,
  onReset,
}: TeleprompterProps) {
  const size = clampFontSize(fontSize);
  const dimmed = new Set(dimmedBeatIds);
  const shift = reducedMotion
    ? lineForWord(offsetWords, WORDS_PER_LINE) * size * LINE_HEIGHT_EM
    : offsetPixels(offsetWords, size);

  function handleKey(event: KeyboardEvent<HTMLElement>) {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      return;
    }

    switch (event.key) {
      case " ":
      case "Spacebar":
        event.preventDefault();
        onTogglePlay();
        break;
      case "ArrowUp":
        event.preventDefault();
        onWpmChange(clampWpm(wpm + WPM_STEP));
        break;
      case "ArrowDown":
        event.preventDefault();
        onWpmChange(clampWpm(wpm - WPM_STEP));
        break;
      case "+":
      case "=":
        event.preventDefault();
        onFontSizeChange(clampFontSize(size + FONT_STEP));
        break;
      case "-":
        event.preventDefault();
        onFontSizeChange(clampFontSize(size - FONT_STEP));
        break;
      case "m":
      case "M":
        event.preventDefault();
        onToggleMirror();
        break;
      case "Home":
        event.preventDefault();
        onReset();
        break;
      default:
        break;
    }
  }

  return (
    <section
      className="teleprompter"
      aria-label="Teleprompter"
      aria-describedby="prompter-keys"
      tabIndex={0}
      onKeyDown={handleKey}
    >
      <div
        className="teleprompter__viewport"
        data-testid="prompter-viewport"
        aria-hidden="true"
        data-mirror={mirror ? "true" : "false"}
        style={
          {
            "--prompter-font-size": `${size}px`,
            transform: mirror ? "scaleX(-1)" : undefined,
          } as CSSProperties
        }
      >
        <div
          className="teleprompter__beats"
          data-testid="prompter-beats"
          style={{ transform: `translateY(-${shift}px)` }}
        >
          {beats.map((beat) => (
            <p
              key={beat.id}
              className={`teleprompter__beat${dimmed.has(beat.id) ? " is-dimmed" : ""}`}
              data-beat-id={beat.id}
              data-dimmed={dimmed.has(beat.id) ? "true" : "false"}
            >
              {beat.text}
            </p>
          ))}
        </div>
        <div className="teleprompter__guide" aria-hidden="true" />
      </div>

      <div className="toolbar teleprompter__controls">
        <button type="button" className="button button--primary" onClick={onTogglePlay}>
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => onWpmChange(clampWpm(wpm - WPM_STEP))}
        >
          Slower
        </button>
        <span className="muted">{wpm} WPM</span>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => onWpmChange(clampWpm(wpm + WPM_STEP))}
        >
          Faster
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => onFontSizeChange(clampFontSize(size - FONT_STEP))}
        >
          Smaller
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => onFontSizeChange(clampFontSize(size + FONT_STEP))}
        >
          Larger
        </button>
        <button
          type="button"
          className="button button--ghost"
          aria-pressed={mirror}
          onClick={onToggleMirror}
        >
          Mirror
        </button>
        <button type="button" className="button button--ghost" onClick={onReset}>
          Reset
        </button>
      </div>

      <p className="sr-only" id="prompter-keys">
        Space plays or pauses. Up and Down change speed. Plus and minus change size. M
        mirrors. Home resets.
      </p>
    </section>
  );
}
