import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ProjectDocument, TranscriptDocument } from "@verbal/core/browser";
import { searchTranscript } from "@verbal/core/browser";
import { resolveAccepted, type Acceptance, type CleanupProposal } from "@verbal/cleanup";
import type { TranscriptDocumentController } from "../hooks/use-transcript-document";
import type { PaneId } from "../hooks/use-studio";
import type { ErrorCopy } from "../lib/error-copy";
import { freezeMaster as freezeMasterApi } from "../lib/api-client";
import { useJob } from "../hooks/use-job";
import { PlaybackScreen } from "./PlaybackScreen";
import { TranscriptEditor, type WordSelection } from "./TranscriptEditor";
import { CleanupReview } from "./CleanupReview";
import { EmptyState } from "./EmptyState";
import { PaneAlert } from "./PaneAlert";

const SHORT_VIEWPORT = "(max-height: 800px), (max-width: 900px)";

/** True while the viewport is short or narrow enough to fold the player. */
function viewportIsShort(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(SHORT_VIEWPORT).matches;
}

/** The default follows a resize; the user's own toggle overrides it. */
function subscribeShortViewport(listener: () => void): () => void {
  if (typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const query = window.matchMedia(SHORT_VIEWPORT);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export type EditWorkspaceProps = {
  /** True only while Edit is the active mode; hides the pane, not the state. */
  active: boolean;
  root: string;
  project: ProjectDocument | null;
  transcript: TranscriptDocument | null;
  /** The word selection, owned by the page so a transcript reload clears it. */
  selection: WordSelection | null;
  setSelection: Dispatch<SetStateAction<WordSelection | null>>;
  editing: TranscriptDocumentController;
  proposals: readonly CleanupProposal[];
  acceptance: Acceptance;
  setProposals: Dispatch<SetStateAction<CleanupProposal[]>>;
  setAcceptance: (acceptance: Acceptance) => void;
  setMessage: (message: string | null) => void;
  guard: (run: () => Promise<void>, pane?: PaneId) => Promise<void>;
  paneError: { pane: PaneId; copy: ErrorCopy } | null;
  onDismissPaneError: () => void;
  onTranscribe: () => void;
  onGoToIngest: () => void;
};

/**
 * The Edit workspace: playback, the editable transcript with search and the
 * structural edit toolbar, and the cleanup inspector. It owns the selection,
 * search, silence, and player state, which only Edit reads.
 */
export function EditWorkspace({
  active,
  root,
  project,
  transcript,
  selection,
  setSelection,
  editing,
  proposals,
  acceptance,
  setProposals,
  setAcceptance,
  setMessage,
  guard,
  paneError,
  onDismissPaneError,
  onTranscribe,
  onGoToIngest,
}: EditWorkspaceProps) {
  const { job } = useJob();
  const [silenceSeconds, setSilenceSeconds] = useState(1);
  const [query, setQuery] = useState("");
  const [matchCursor, setMatchCursor] = useState(0);
  const defaultPlayerCollapsed = useSyncExternalStore(
    subscribeShortViewport,
    viewportIsShort,
    () => false,
  );
  const [playerCollapsedOverride, setPlayerCollapsedOverride] = useState<boolean | null>(null);
  const playerCollapsed = playerCollapsedOverride ?? defaultPlayerCollapsed;
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const transcriptCardRef = useRef<HTMLDivElement | null>(null);
  const focusTokenRef = useRef(0);
  const [focusRequest, setFocusRequest] = useState<{ index: number; token: number } | undefined>(
    undefined,
  );

  const hasMedia = project?.media !== undefined;
  const liveWords =
    transcript === null ? 0 : transcript.words.length - transcript.removedWordIds.length;

  const matches = useMemo(
    () => (transcript === null ? [] : searchTranscript(transcript, query)),
    [transcript, query],
  );

  const selectionHasRemoved =
    selection !== null &&
    transcript !== null &&
    transcript.words
      .slice(selection.fromIndex, selection.toIndex + 1)
      .some((word) => transcript.removedWordIds.includes(word.id));

  const acceptedProposals = resolveAccepted(proposals, acceptance);

  const transcribing =
    job !== null &&
    job.kind === "transcribe" &&
    (job.status === "queued" || job.status === "running");

  /** The word the structural edits act on: the start of the selection. */
  function selectedWordId(): string | undefined {
    if (selection === null || transcript === null) {
      return undefined;
    }
    return transcript.words[selection.fromIndex]?.id;
  }

  function insertSilenceAtSelection() {
    return guard(async () => {
      const wordId = selectedWordId();
      if (wordId === undefined) {
        return;
      }

      editing.insertSilence(wordId, silenceSeconds);
      setMessage(`Inserted ${silenceSeconds}s of silence`);
    });
  }

  function splitAtSelection() {
    return guard(async () => {
      const wordId = selectedWordId();
      if (wordId === undefined) {
        return;
      }

      editing.splitSegment(wordId);
      setMessage("Started a new segment");
    });
  }

  /** Moves the selected block by one word, keeping the selection on it. */
  function moveSelection(direction: 1 | -1) {
    return guard(async () => {
      if (selection === null || transcript === null) {
        return;
      }

      const blockLength = selection.toIndex - selection.fromIndex + 1;
      const target = selection.fromIndex + direction * blockLength;
      const maxTarget = transcript.words.length - blockLength;

      if (target < 0 || target > maxTarget) {
        return;
      }

      editing.moveRange(selection.fromIndex, selection.toIndex, target);
      setSelection({ fromIndex: target, toIndex: target + blockLength - 1 });
    });
  }

  /**
   * Moves focus to the transcript listbox after the update. A toolbar button
   * disables itself once its selection is gone, and a disabled button drops focus.
   */
  function focusTranscript() {
    queueMicrotask(() => {
      transcriptCardRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus();
    });
  }

  /** Asks the editor to place the caret on a word, once, with a fresh token. */
  function requestCaretAt(index: number) {
    if (index < 0) {
      return;
    }
    focusTokenRef.current += 1;
    setFocusRequest({ index, token: focusTokenRef.current });
  }

  /**
   * The word to put the caret on after removing `[fromIndex, toIndex]`: the
   * next kept word after the range, or the previous kept word when none follows.
   */
  function nextKeptIndexAfter(fromIndex: number, toIndex: number): number {
    if (transcript === null) {
      return -1;
    }
    const removed = new Set(transcript.removedWordIds);
    for (let index = fromIndex; index <= toIndex; index += 1) {
      const word = transcript.words[index];
      if (word !== undefined) {
        removed.add(word.id);
      }
    }
    for (let index = toIndex + 1; index < transcript.words.length; index += 1) {
      const word = transcript.words[index];
      if (word !== undefined && !removed.has(word.id)) {
        return index;
      }
    }
    for (let index = fromIndex - 1; index >= 0; index -= 1) {
      const word = transcript.words[index];
      if (word !== undefined && !removed.has(word.id)) {
        return index;
      }
    }
    return -1;
  }

  /** The first removed word in a range, or -1 when the range is all kept. */
  function firstRemovedIndex(fromIndex: number, toIndex: number): number {
    if (transcript === null) {
      return -1;
    }
    const removed = new Set(transcript.removedWordIds);
    for (let index = fromIndex; index <= toIndex; index += 1) {
      const word = transcript.words[index];
      if (word !== undefined && removed.has(word.id)) {
        return index;
      }
    }
    return -1;
  }

  function deleteSelection() {
    if (selection === null || transcript === null) {
      return;
    }

    const removedSet = new Set(transcript.removedWordIds);
    const removedCount = transcript.words
      .slice(selection.fromIndex, selection.toIndex + 1)
      .filter((word) => !removedSet.has(word.id)).length;

    const focusIndex = nextKeptIndexAfter(selection.fromIndex, selection.toIndex);
    editing.removeRange(selection.fromIndex, selection.toIndex);
    setSelection(null);
    setMessage(`Removed ${removedCount} ${removedCount === 1 ? "word" : "words"}`);
    focusTranscript();
    requestCaretAt(focusIndex);
  }

  function restoreRange(fromIndex: number, toIndex: number) {
    if (transcript === null) {
      return;
    }

    const removedSet = new Set(transcript.removedWordIds);
    const restoredCount = transcript.words
      .slice(fromIndex, toIndex + 1)
      .filter((word) => removedSet.has(word.id)).length;

    editing.restore(fromIndex, toIndex);
    focusTranscript();
    if (restoredCount > 0) {
      setMessage(`Restored ${restoredCount} ${restoredCount === 1 ? "word" : "words"}`);
    }
  }

  function restoreSelection() {
    if (selection === null) {
      return;
    }

    const focusIndex = firstRemovedIndex(selection.fromIndex, selection.toIndex);
    restoreRange(selection.fromIndex, selection.toIndex);
    requestCaretAt(focusIndex);
  }

  function removeAcceptedProposals() {
    if (acceptedProposals.length === 0) {
      return;
    }

    // One edit, so a single undo puts every accepted word back.
    editing.removeRanges(
      acceptedProposals.map(({ fromIndex, toIndex }) => ({ fromIndex, toIndex })),
    );

    const removed = new Set(acceptedProposals.map((proposal) => proposal.id));
    setProposals((current) => current.filter((proposal) => !removed.has(proposal.id)));
    setSelection(null);
    setMessage(
      `Removed ${acceptedProposals.length} cleanup ${
        acceptedProposals.length === 1 ? "proposal" : "proposals"
      }.`,
    );
  }

  function freezeMaster() {
    return guard(async () => {
      const { master } = await freezeMasterApi(root);

      setMessage(
        `Frozen master: ${master.masterDurationSeconds.toFixed(2)}s · ` +
          `${master.anchorWords.length} anchors · ${master.fingerprint.slice(0, 8)}`,
      );
    });
  }

  function announceMatch(cursor: number, count: number) {
    setMessage(count === 0 ? "No matches" : `Match ${cursor + 1} of ${count}`);
  }

  function stepMatch(direction: 1 | -1) {
    if (matches.length === 0) {
      return;
    }

    const next = (matchCursor + direction + matches.length) % matches.length;
    setMatchCursor(next);
    announceMatch(next, matches.length);

    const match = matches[next];
    if (match !== undefined) {
      setSelection({ fromIndex: match.fromIndex, toIndex: match.toIndex });
    }
  }

  // Stay mounted in every mode so the selection and search survive a mode
  // switch, exactly as they did when they lived in Home. Only the pane hides.
  if (!active) {
    return null;
  }

  return (
    <>
      <section className="stage" aria-label="edit workspace">
        <div className="stage__scroll stage__scroll--edit">
          <header className="stage__head">
            <div>
              <h2>Edit</h2>
              <p className="stage__sub">Edit the video by editing its transcript.</p>
            </div>
            {transcript !== null && (
              <span className="pill">
                {liveWords.toLocaleString()} {liveWords === 1 ? "word" : "words"}
              </span>
            )}
          </header>

          {paneError?.pane === "edit" && (
            <PaneAlert
              message={paneError.copy.message}
              detail={paneError.copy.detail}
              onDismiss={onDismissPaneError}
            />
          )}

          {project === null ? (
            <EmptyState
              title="No Project Open"
              body="Open a project in Ingest to edit its transcript."
              action={{ label: "Go to Ingest", onClick: onGoToIngest }}
            />
          ) : !hasMedia ? (
            <EmptyState
              title="No Media Yet"
              body="Import a recording or file in Ingest, then transcribe it."
              action={{ label: "Go to Ingest", onClick: onGoToIngest }}
            />
          ) : (
            <>
              <div className="card card--flush" role="region" aria-label="Playback">
                <PlaybackScreen
                  transcript={transcript}
                  mediaUrl={`/api/media/file?root=${encodeURIComponent(root)}`}
                  showTranscript={false}
                  onActiveWordChange={setActiveWordId}
                  onVideoReady={(video) => {
                    playerRef.current = video;
                  }}
                  waveformUrl={`/api/media/waveform?root=${encodeURIComponent(root)}`}
                  collapsed={playerCollapsed}
                  onToggleCollapsed={() => setPlayerCollapsedOverride(!playerCollapsed)}
                />
              </div>

              {transcript === null ? (
                <EmptyState
                  title="No Transcript Yet"
                  body="Play and scrub the take now. Transcribe it here to edit the words."
                  action={{
                    label: transcribing ? "Transcribing…" : "Transcribe",
                    onClick: () => {
                      if (!transcribing) {
                        onTranscribe();
                      }
                    },
                  }}
                />
              ) : (
                <div
                  className="card"
                  role="region"
                  aria-label="Transcript editor"
                  ref={transcriptCardRef}
                >
                  <div className="card__head">
                    <h3>Transcript</h3>
                    <div className="toolbar">
                      <label className="search">
                        <span className="sr-only">Find in Transcript</span>
                        <input
                          autoComplete="off"
                          value={query}
                          onChange={(event) => {
                            const value = event.target.value;
                            setQuery(value);
                            setMatchCursor(0);
                            const nextMatches =
                              transcript === null ? [] : searchTranscript(transcript, value);
                            const first = nextMatches[0];
                            setSelection(
                              first === undefined
                                ? null
                                : { fromIndex: first.fromIndex, toIndex: first.toIndex },
                            );
                            if (value.trim() !== "") {
                              announceMatch(0, nextMatches.length);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") {
                              return;
                            }
                            event.preventDefault();
                            stepMatch(event.shiftKey ? -1 : 1);
                          }}
                          placeholder="Find in Transcript…"
                        />
                      </label>
                      {query.trim() !== "" && (
                        <>
                          <span className="muted">
                            {matches.length === 0
                              ? "No matches"
                              : `${matchCursor + 1} of ${matches.length}`}
                          </span>
                          <button
                            type="button"
                            className="button button--ghost"
                            onClick={() => stepMatch(-1)}
                            disabled={matches.length === 0}
                            aria-label="Previous match"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="button button--ghost"
                            onClick={() => stepMatch(1)}
                            disabled={matches.length === 0}
                            aria-label="Next match"
                          >
                            ↓
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <TranscriptEditor
                    transcript={transcript}
                    selectedRange={selection}
                    matchedRanges={matches}
                    activeWordId={activeWordId}
                    onWordClick={(_wordId, index) => {
                      setSelection({ fromIndex: index, toIndex: index });

                      // The single transcript is also the transport: clicking a
                      // word seeks the player, exactly as the read-only copy did.
                      const word = transcript?.words[index];
                      if (word !== undefined && playerRef.current !== null) {
                        playerRef.current.currentTime = word.start;
                      }
                    }}
                    onSelectionChange={setSelection}
                    onSelectionClear={() => setSelection(null)}
                    onDeleteSelection={deleteSelection}
                    onRestore={restoreRange}
                    focusRequest={focusRequest}
                  />

                  <div className="toolbar toolbar--wrap toolbar--footer">
                    <label className="field field--inline">
                      Silence (s)
                      <input
                        autoComplete="off"
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={silenceSeconds}
                        onChange={(event) => setSilenceSeconds(Number(event.target.value))}
                      />
                    </label>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={insertSilenceAtSelection}
                      disabled={selection === null}
                    >
                      Insert Silence
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={splitAtSelection}
                      disabled={selection === null}
                    >
                      Split
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => moveSelection(-1)}
                      disabled={selection === null}
                    >
                      Move Back
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => moveSelection(1)}
                      disabled={selection === null}
                    >
                      Move Forward
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={deleteSelection}
                      disabled={selection === null}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={restoreSelection}
                      disabled={!selectionHasRemoved}
                      title="Space"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={editing.undo}
                      disabled={!editing.canUndo}
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={editing.redo}
                      disabled={!editing.canRedo}
                    >
                      Redo
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <aside className="inspector" aria-label="Inspector">
        <section className="inspector__section" aria-label="Cleanup">
          <h3>Cleanup</h3>
          {transcript === null ? (
            <p className="muted">Nothing to clean yet.</p>
          ) : (
            <>
              {proposals.length === 0 ? (
                <p className="muted">No filler words, stutters, or repetitions found.</p>
              ) : (
                <>
                  <p className="muted">
                    {acceptedProposals.length} of {proposals.length} proposals accepted
                  </p>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={removeAcceptedProposals}
                    disabled={acceptedProposals.length === 0}
                  >
                    Remove Accepted
                  </button>
                </>
              )}
              <CleanupReview
                transcript={transcript}
                proposals={proposals}
                audioFixes={[]}
                acceptance={acceptance}
                onAcceptanceChange={setAcceptance}
                onFreeze={freezeMaster}
              />
            </>
          )}
        </section>
      </aside>
    </>
  );
}
