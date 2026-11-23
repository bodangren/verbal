import { useEffect, useRef, useState, type RefObject } from "react";
import { splitBeats, type BeatStatus, type TakeAlignment } from "@verbal/takes";
import { TakeReview, type TakeReviewLlm } from "./TakeReview";
import { Teleprompter } from "./Teleprompter";

export type StudioTake = {
  id: string;
  fileName: string;
  createdAt: string;
  durationSeconds: number;
};

export type StudioDevice = {
  deviceId: string;
  label: string;
};

export type StudioTakeState = "idle" | "countdown" | "recording" | "uploading";

export type StudioCapture = {
  state: StudioTakeState;
  countdown: number | null;
  elapsedSeconds: number;
  cameraAvailable: boolean;
  previewing: boolean;
  cameras: readonly StudioDevice[];
  microphones: readonly StudioDevice[];
  cameraId: string | null;
  microphoneId: string | null;
  takes: readonly StudioTake[];
  onStart: () => void;
  onStop: () => void;
  onStartPreview: () => void;
  onCameraChange: (id: string) => void;
  onMicrophoneChange: (id: string) => void;
};

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
  capture: StudioCapture;
  review: { takeId: string; alignment: TakeAlignment } | null;
  reviewing: boolean;
  reviewLlm: TakeReviewLlm;
  takeUrl?: string;
  onReview: (takeId: string) => void;
  onReread: (beatId: string) => void;
  onStatusChange: (beatId: string, status: BeatStatus) => void;
  onSeek: (seconds: number) => void;
  cut?: { ranges: number; durationSeconds: number; building: boolean };
  onBuildCut?: () => void;
  onClose: () => void;
  onScriptChange: (text: string) => void;
  onUseTranscript: () => void;
  onTogglePlay: () => void;
  onWpmChange: (wpm: number) => void;
  onFontSizeChange: (size: number) => void;
  onToggleMirror: () => void;
  onReset: () => void;
};

function formatElapsed(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A full-screen Studio: the camera fills the window, the prompter floats over
 * the top center, and the script and capture settings live in a side panel.
 * Nothing scrolls.
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
  capture,
  review,
  reviewing,
  reviewLlm,
  takeUrl,
  onReview,
  onReread,
  onStatusChange,
  onSeek,
  cut,
  onBuildCut,
  onClose,
  onScriptChange,
  onUseTranscript,
  onTogglePlay,
  onWpmChange,
  onFontSizeChange,
  onToggleMirror,
  onReset,
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

  const busy = capture.state === "countdown" || capture.state === "uploading";

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

      {!capture.previewing && (
        <div className="studio-overlay__placeholder">
          <p>
            {capture.cameraAvailable
              ? "Camera preview is off"
              : "No camera available in this browser."}
          </p>
          {capture.cameraAvailable && (
            <button
              type="button"
              className="button button--primary"
              onClick={capture.onStartPreview}
            >
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

      {capture.countdown !== null && (
        <div className="studio-overlay__countdown" role="status" aria-live="assertive">
          {capture.countdown}
        </div>
      )}

      <div className="studio-overlay__transport">
        <button
          type="button"
          className="button button--primary"
          onClick={capture.state === "recording" ? capture.onStop : capture.onStart}
          disabled={busy}
        >
          {capture.state === "recording"
            ? "Stop"
            : capture.state === "uploading"
              ? "Saving…"
              : "Record"}
        </button>
        <span className="muted">{formatElapsed(capture.elapsedSeconds)}</span>
        {capture.state === "recording" && <span className="muted">Recording</span>}
        {capture.state === "uploading" && <span className="muted">Saving take…</span>}
        {capture.takes.length > 0 && (
          <span className="muted">
            {capture.takes.length} {capture.takes.length === 1 ? "take" : "takes"}
          </span>
        )}
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

          <details className="disclosure" open>
            <summary>Capture Settings</summary>
            <label className="field">
              Camera
              <select
                value={capture.cameraId ?? ""}
                onChange={(event) => capture.onCameraChange(event.target.value)}
              >
                <option value="">Default camera</option>
                {capture.cameras.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Microphone
              <select
                value={capture.microphoneId ?? ""}
                onChange={(event) => capture.onMicrophoneChange(event.target.value)}
              >
                <option value="">Default microphone</option>
                {capture.microphones.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
          </details>

          <details className="disclosure">
            <summary>Takes</summary>
            {capture.takes.length === 0 ? (
              <p className="muted">No takes yet.</p>
            ) : (
              <ul className="studio-overlay__takes" aria-label="Takes">
                {capture.takes.map((take) => (
                  <li key={take.id}>
                    <span>{take.fileName}</span>
                    <span className="muted">{formatElapsed(take.durationSeconds)}</span>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => onReview(take.id)}
                      disabled={reviewing}
                    >
                      {reviewing ? "Reviewing…" : "Review"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>

          {review !== null && (
            <details className="disclosure" open>
              <summary>Review</summary>
              <TakeReview
                beats={splitBeats(script)}
                alignment={review.alignment}
                takeUrl={takeUrl}
                onReread={onReread}
                onStatusChange={onStatusChange}
                onSeek={onSeek}
                llm={reviewLlm}
                cut={cut}
                onBuildCut={onBuildCut}
              />
            </details>
          )}
        </aside>
      )}
    </div>
  );
}
