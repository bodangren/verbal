import { useEffect, useRef, useState, type RefObject } from "react";
import type { KeyQuality } from "@verbal/media/key-quality";
import { splitBeats } from "@verbal/takes";
import { CapturePanel } from "./CapturePanel";
import { Teleprompter } from "./Teleprompter";

export type StudioOverlayProps = {
  projectName: string | null;
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
  videoRef: RefObject<HTMLVideoElement | null>;
  previewing: boolean;
  cameraAvailable: boolean;
  keyQuality: KeyQuality | null;
  recording: boolean;
  durationSeconds: number;
  onClose: () => void;
  onScriptChange: (text: string) => void;
  onUseTranscript: () => void;
  onTogglePlay: () => void;
  onWpmChange: (wpm: number) => void;
  onFontSizeChange: (size: number) => void;
  onToggleMirror: () => void;
  onReset: () => void;
  onStartPreview: () => void;
  onStopPreview: () => void;
  onDurationChange: (seconds: number) => void;
  onRecord: () => void;
  onStopRecording: () => void;
};

/**
 * A full-screen Studio: the camera fills the window, the prompter floats over
 * the top center, and the script lives in a side panel. Nothing scrolls.
 *
 * The overlay is rendered only while open, so focus and Escape listeners mount
 * with it. The prompter is never part of the recorded frame; it is a UI layer.
 */
export function StudioOverlay({
  projectName,
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
  videoRef,
  previewing,
  cameraAvailable,
  keyQuality,
  recording,
  durationSeconds,
  onClose,
  onScriptChange,
  onUseTranscript,
  onTogglePlay,
  onWpmChange,
  onFontSizeChange,
  onToggleMirror,
  onReset,
  onStartPreview,
  onStopPreview,
  onDurationChange,
  onRecord,
  onStopRecording,
}: StudioOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [scriptOpen, setScriptOpen] = useState(() => script.trim() === "");

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

  return (
    <div
      ref={dialogRef}
      className="studio-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Studio"
      tabIndex={-1}
    >
      <video
        ref={videoRef}
        className="studio-overlay__video"
        data-testid="studio-video"
        muted
        playsInline
        aria-label="Camera preview"
      />

      {!previewing && (
        <div className="studio-overlay__placeholder">
          <p>{cameraAvailable ? "Camera preview is off" : "No camera available in this browser."}</p>
          {cameraAvailable && (
            <button type="button" className="button button--primary" onClick={onStartPreview}>
              Start Camera
            </button>
          )}
        </div>
      )}

      <div className="studio-overlay__top">
        <span className="studio-overlay__title">{projectName ?? "Studio"}</span>
        <button
          type="button"
          className="button button--ghost"
          aria-expanded={scriptOpen}
          aria-controls="studio-script"
          onClick={() => setScriptOpen((open) => !open)}
        >
          Script
        </button>
        <button type="button" className="button button--ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="studio-overlay__prompter">
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
      </div>

      {scriptOpen && (
        <aside id="studio-script" className="studio-overlay__script" aria-label="Script panel">
          <div className="studio__head">
            <h3>Script</h3>
            <span className="muted">{words} words</span>
            <span className="muted">{readTime} read</span>
            <button type="button" className="button button--ghost" onClick={onUseTranscript}>
              Use Transcript
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setScriptOpen(false)}
            >
              Close Script
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

          <details className="disclosure">
            <summary>Camera Controls</summary>
            <CapturePanel
              cameraAvailable={cameraAvailable}
              keyQuality={keyQuality}
              previewing={previewing}
              recording={recording}
              durationSeconds={durationSeconds}
              onStartPreview={onStartPreview}
              onStopPreview={onStopPreview}
              onDurationChange={onDurationChange}
              onRecord={onRecord}
              onStop={onStopRecording}
            />
          </details>
        </aside>
      )}
    </div>
  );
}
