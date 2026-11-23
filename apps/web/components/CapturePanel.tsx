import type { KeyQuality } from "@verbal/media/key-quality";

export type CapturePanelProps = {
  cameraAvailable: boolean;
  keyQuality: KeyQuality | null;
  previewing: boolean;
  recording: boolean;
  durationSeconds: number;
  onStartPreview: () => void;
  onStopPreview: () => void;
  onDurationChange: (seconds: number) => void;
  onRecord: () => void;
  onStop: () => void;
};

/**
 * Capture controls and key-quality feedback.
 *
 * The panel is presentational: the page owns the camera stream, canvas
 * sampling, and the recording request.
 */
export function CapturePanel({
  cameraAvailable,
  keyQuality,
  previewing,
  recording,
  durationSeconds,
  onStartPreview,
  onStopPreview,
  onDurationChange,
  onRecord,
  onStop,
}: CapturePanelProps) {
  return (
    <section className="capture" aria-label="Capture controls">
      {!cameraAvailable && (
        <p className="status status--error">No camera available in this browser.</p>
      )}

      <div className="row">
        <button
          type="button"
          className="button"
          onClick={onStartPreview}
          disabled={!cameraAvailable || previewing}
        >
          Start preview
        </button>
        <button type="button" onClick={onStopPreview} disabled={!previewing}>
          Stop preview
        </button>
      </div>

      <label className="field">
        Duration (seconds)
        <input
          type="number"
          min={1}
          max={3600}
          value={durationSeconds}
          onChange={(event) => onDurationChange(Number(event.target.value))}
        />
      </label>

      <div className="row">
        <button type="button" onClick={onRecord} disabled={!cameraAvailable || recording}>
          Record
        </button>
        <button type="button" onClick={onStop} disabled={!recording}>
          Stop recording
        </button>
      </div>

      {keyQuality !== null && (
        <p className="key-quality" data-level={keyQuality.level}>
          {keyQuality.message}
        </p>
      )}
    </section>
  );
}
