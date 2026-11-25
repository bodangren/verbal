/** The fields the Ingest inspector reads from an injected probe result. */
export type ProbeSummary = {
  durationSeconds: number | null;
  sizeBytes: number | null;
  videoCodec: string | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  audioCodec: string | null;
  channels: number | null;
  sampleRate: number | null;
};

export type IngestInspectorProps = {
  probe: ProbeSummary | null;
  probeError?: string | null;
  probeLoading?: boolean;
  hasMedia: boolean;
  hasTranscript: boolean;
  transcribing: boolean;
  onOpenInEdit: () => void;
};

function seconds(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest}s`;
}

function bytes(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return "—";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function resolution(probe: ProbeSummary): string {
  if (probe.width === null || probe.height === null) {
    return "—";
  }
  return `${probe.width}×${probe.height}`;
}

function Step({ label, done }: { label: string; done: boolean }) {
  return (
    <li className="step" data-done={done}>
      <span>{label}</span>
      <span className="muted">{done ? "Done" : "Pending"}</span>
    </li>
  );
}

/**
 * The Ingest inspector: media details from the probe, then the next steps.
 *
 * The probe result is injected, so the component never fetches and tests can
 * describe the formats they care about.
 */
export function IngestInspector({
  probe,
  probeError = null,
  probeLoading = false,
  hasMedia,
  hasTranscript,
  transcribing,
  onOpenInEdit,
}: IngestInspectorProps) {
  return (
    <aside className="inspector" aria-label="Inspector">
      <section className="inspector__section" aria-label="Media Details">
        <h3>Media Details</h3>
        {probeError !== null ? (
          <p className="status status--error" role="alert">
            {probeError}
          </p>
        ) : probe === null ? (
          <p className="muted">
            {probeLoading && hasMedia
              ? "Reading media…"
              : hasMedia
                ? "Details unavailable for this take."
                : "No media imported yet."}
          </p>
        ) : (
          <dl className="details">
            <dt>Video codec</dt>
            <dd>{probe.videoCodec ?? "—"}</dd>
            <dt>Resolution</dt>
            <dd>{resolution(probe)}</dd>
            <dt>Frame rate</dt>
            <dd>{probe.frameRate === null ? "—" : `${probe.frameRate} fps`}</dd>
            <dt>Audio</dt>
            <dd>
              {probe.audioCodec ?? "—"}
              {probe.channels === null ? "" : ` · ${probe.channels} ch`}
              {probe.sampleRate === null ? "" : ` · ${probe.sampleRate} Hz`}
            </dd>
            <dt>Duration</dt>
            <dd>{seconds(probe.durationSeconds)}</dd>
            <dt>File size</dt>
            <dd>{bytes(probe.sizeBytes)}</dd>
          </dl>
        )}
      </section>

      <section className="inspector__section" aria-label="Next Steps">
        <h3>Next Steps</h3>
        <ul className="steps" aria-label="Next Steps">
          <Step label="Import" done={hasMedia} />
          <Step
            label={transcribing ? "Transcribe (in progress)" : "Transcribe"}
            done={hasTranscript}
          />
          <Step label="Open in Edit" done={hasTranscript} />
        </ul>
        <button
          type="button"
          className="button button--primary"
          onClick={onOpenInEdit}
          disabled={!hasTranscript}
        >
          Open in Edit
        </button>
      </section>
    </aside>
  );
}
