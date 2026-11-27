import { useEffect, useRef, useState, type ReactNode } from "react";

/** The media row's transcription state. */
export type MediaState =
  | { kind: "none" }
  | { kind: "untranscribed" }
  | { kind: "transcribing"; progress: number }
  | { kind: "transcribed"; words: number }
  | { kind: "failed"; detail?: string };

export type IngestStageProps = {
  projectName: string | null;
  mediaName: string | null;
  state: MediaState;
  /** Human name of the provider in use, e.g. "Cloud (OpenAI-compatible)". */
  provider: string;
  /** True when the provider sends audio off the machine. */
  cloud: boolean;
  /** Next step when no speech engine is set up. */
  hint?: string;
  /** True when the current transcript has edits that transcription would replace. */
  hasEdits?: boolean;
  /** Removed words in the current transcript. */
  removedWords?: number;
  /** Inserted silences in the current transcript. */
  silences?: number;
  onImport: () => void;
  onRecord: () => void;
  onTranscribe: () => void;
  onRetry: () => void;
  onTranscribeSeveral: () => void;
  /** The capture surface, revealed by Record. */
  children?: ReactNode;
};

function stateLabel(state: MediaState): string {
  switch (state.kind) {
    case "none":
      return "No Media Yet";
    case "untranscribed":
      return "Not Transcribed";
    case "transcribing":
      return `Transcribing… ${Math.max(0, Math.min(100, Math.round(state.progress * 100)))}%`;
    case "transcribed":
      return `Transcribed ${state.words} ${state.words === 1 ? "word" : "words"}`;
    case "failed":
      return state.detail === undefined ? "Failed" : `Failed: ${state.detail}`;
  }
}

/** The confirm sentence, with a count part for each non-zero edit kind. */
function replacementMessage(removedWords: number, silences: number): string {
  const sentence = "Transcribing again replaces your edits to this transcript";
  const parts: string[] = [];
  if (removedWords > 0) {
    parts.push(`${removedWords} removed ${removedWords === 1 ? "word" : "words"}`);
  }
  if (silences > 0) {
    parts.push(`${silences} ${silences === 1 ? "silence" : "silences"}`);
  }
  return parts.length === 0 ? `${sentence}.` : `${sentence}: ${parts.join(", ")}.`;
}

/**
 * The Ingest stage: one import card, the media row with its transcription
 * state, and the provider in use.
 *
 * Import and transcription share this surface so the user does not have to
 * change modes between choosing a take and transcribing it.
 */
export function IngestStage({
  projectName,
  mediaName,
  state,
  provider,
  cloud,
  hint,
  hasEdits = false,
  removedWords = 0,
  silences = 0,
  onImport,
  onRecord,
  onTranscribe,
  onRetry,
  onTranscribeSeveral,
  children,
}: IngestStageProps) {
  const canTranscribe =
    mediaName !== null && state.kind !== "transcribing" && state.kind !== "none";
  const hasAnyEdits = hasEdits || removedWords > 0 || silences > 0;
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  function requestTranscribe() {
    if (hasAnyEdits) {
      setConfirming(true);
      return;
    }
    onTranscribe();
  }

  function cancelConfirm() {
    setConfirming(false);
    triggerRef.current?.focus();
  }

  function confirmTranscribe() {
    setConfirming(false);
    onTranscribe();
  }

  // On first run the New Project action leads, so it sits above the
  // disabled Import and Media cards instead of below them.
  const lead = projectName === null ? children : null;
  const trail = projectName === null ? null : children;

  return (
    <div className="stage__scroll">
      <header className="stage__head">
        <div>
          <h2>Ingest</h2>
          <p className="stage__sub">
            {projectName === null
              ? "Open or create a project to import a take."
              : `Import and transcribe a take into ${projectName}.`}
          </p>
        </div>
        <span className="pill">
          {state.kind === "transcribed" ? "Transcript ready" : "No transcript"}
        </span>
      </header>

      {lead}

      <div className="card">
        <h3>Import</h3>
        <p className="muted">
          Choose a recording or an existing file. Importing starts as soon as you pick a file.
        </p>
        <div className="toolbar">
          <button
            type="button"
            className="button button--primary"
            onClick={onImport}
            disabled={projectName === null}
          >
            Import Media
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={onRecord}
            disabled={projectName === null}
          >
            Record
          </button>
        </div>
        <p className="muted" data-testid="provider-line">
          Provider: {provider}
          {hint !== undefined
            ? ` · ${hint}`
            : cloud
              ? " · Audio leaves this machine."
              : " · Audio stays on this machine."}
        </p>
      </div>

      <div className="card">
        <h3>Media</h3>
        <ul className="media-list" aria-label="Project media">
          <li className="media-row" data-state={state.kind}>
            <span className="media-row__name">{mediaName ?? "No media imported"}</span>
            <span className="media-row__state">{stateLabel(state)}</span>
            {state.kind === "untranscribed" && (
              <button
                type="button"
                className="button button--primary"
                onClick={onTranscribe}
                disabled={!canTranscribe}
              >
                Transcribe
              </button>
            )}
            {state.kind === "transcribing" && (
              <button type="button" className="button button--primary" disabled>
                Transcribing…
              </button>
            )}
            {state.kind === "transcribed" && (
              <button
                ref={triggerRef}
                type="button"
                className="button button--ghost"
                onClick={requestTranscribe}
                disabled={!canTranscribe}
              >
                Transcribe Again
              </button>
            )}
            {state.kind === "failed" && (
              <button
                type="button"
                className="button button--primary"
                onClick={onRetry}
                disabled={!canTranscribe}
              >
                Retry
              </button>
            )}
          </li>
        </ul>
        {confirming && state.kind === "transcribed" && (
          <div
            className="confirm"
            role="group"
            aria-label="Confirm transcribing again"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelConfirm();
              }
            }}
          >
            <p>{replacementMessage(removedWords, silences)}</p>
            <div className="toolbar">
              <button
                type="button"
                className="button button--danger"
                onClick={confirmTranscribe}
              >
                Replace Transcript
              </button>
              <button
                ref={cancelRef}
                type="button"
                className="button button--ghost"
                onClick={cancelConfirm}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="toolbar">
        <button type="button" className="button button--ghost" onClick={onTranscribeSeveral}>
          Transcribe Several Projects
        </button>
      </div>

      {trail}
    </div>
  );
}
