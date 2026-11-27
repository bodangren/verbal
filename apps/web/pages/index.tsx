import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ProjectDocument } from "@verbal/core/browser";
import { DEFAULT_ACCEPTANCE, type Acceptance, type CleanupProposal } from "@verbal/cleanup";
import { countWords, formatReadTime, readTimeSeconds } from "@verbal/takes";
import type { FsEntry } from "../server/fs-api";
import { errorCopyFor, type ErrorCopy } from "../lib/error-copy";
import { TopBar, type SaveState, type WorkspaceMode } from "../components/TopBar";
import { ProjectBrowser } from "../components/ProjectBrowser";
import { MediaPicker } from "../components/MediaPicker";
import { BatchDialog } from "../components/BatchDialog";
import { PaneAlert } from "../components/PaneAlert";
import { StatusBar } from "../components/StatusBar";
import { StudioHost } from "../components/StudioHost";
import { IngestWorkspace } from "../components/IngestWorkspace";
import { EditWorkspace } from "../components/EditWorkspace";
import { DeliverWorkspace } from "../components/DeliverWorkspace";
import type { WordSelection } from "../components/TranscriptEditor";
import { JobProvider, useJob, useJobActions } from "../hooks/use-job";
import { clearFinishedJob, jobStatusText } from "../components/job-status";
import { clearSession, loadSession, saveSession } from "../lib/session";
import { useAutoSave } from "../hooks/use-auto-save";
import { useTranscriptDocument } from "../hooks/use-transcript-document";
import type { PaneId } from "../hooks/use-studio";
import {
  createProject as createProjectApi,
  getCleanup,
  getProject,
  getScript,
  getTranscript,
  importMedia as importMediaApi,
  listFolder,
  saveScript,
  saveTranscript,
  transcribe,
  transcribeBatch,
} from "../lib/api-client";

/** Remembers the folder you were browsing, so launch lands on your work. */
const BROWSER_PATH_KEY = "verbal.browser.path";

/** Counts Home renders for the render-isolation test; no-op outside tests. */
let homeRenderCount = 0;

function recordHomeRender(): void {
  if (process.env.NODE_ENV === "test") {
    homeRenderCount += 1;
  }
}

/** The camera capability never changes at runtime, so there is nothing to subscribe to. */
function subscribeNever(): () => void {
  return () => undefined;
}

function canUseCamera(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices !== undefined &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/** Reduced motion is a media query; subscribe so the prompter can step by line. */
function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function readReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * `Home` is a thin shell around `HomePage` and the `JobProvider`. The job
 * lives in the provider, so a poll tick re-renders only its consumers, never
 * this shell — the render-counter test counts exactly this component.
 */
export default function Home() {
  recordHomeRender();
  return (
    <JobProvider>
      <HomePage />
    </JobProvider>
  );
}

/** Warns before leaving while an edit is unsaved or a job is running. */
function BeforeUnloadGuard({ dirty }: { dirty: boolean }) {
  const { runningJob } = useJob();

  useEffect(() => {
    if (!dirty && !runningJob) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, runningJob]);

  return null;
}

/** The status line, which is the one place a poll tick updates the job text. */
function JobStatusBar({
  mediaLabel,
  message,
  error,
}: {
  mediaLabel: string;
  message: string | null;
  error: ErrorCopy | null;
}) {
  const { job } = useJob();
  return (
    <StatusBar
      jobText={jobStatusText(job) ?? "Ready"}
      mediaLabel={mediaLabel}
      message={message}
      error={error}
    />
  );
}

function HomePage() {
  const { setJob, pollJob } = useJobActions();

  const [root, setRoot] = useState("");
  const [project, setProject] = useState<ProjectDocument | null>(null);
  const editing = useTranscriptDocument(null);
  const { undo: undoEdit, redo: redoEdit } = editing;
  const transcript = editing.document;
  const [selection, setSelection] = useState<WordSelection | null>(null);
  const [proposals, setProposals] = useState<CleanupProposal[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSelected, setBatchSelected] = useState<string[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [script, setScript] = useState("");
  const [scriptSaved, setScriptSaved] = useState("");

  const [browserPath, setBrowserPath] = useState("");
  const [browserParent, setBrowserParent] = useState<string | null>(null);
  const [browserEntries, setBrowserEntries] = useState<FsEntry[]>([]);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [browserLoading, setBrowserLoading] = useState(false);
  const browserPathRef = useRef("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPath, setPickerPath] = useState("");
  const [pickerParent, setPickerParent] = useState<string | null>(null);
  const [pickerEntries, setPickerEntries] = useState<FsEntry[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [batchOutcomes, setBatchOutcomes] = useState<
    { root: string; status: string; detail?: string }[]
  >([]);
  const [acceptance, setAcceptance] = useState<Acceptance>(DEFAULT_ACCEPTANCE);
  const [transcribeFailure, setTranscribeFailure] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>("ingest");
  const [error, setError] = useState<ErrorCopy | null>(null);
  const [paneError, setPaneError] = useState<{
    pane: PaneId;
    copy: ErrorCopy;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /** Reset handle the Studio assigns, so a script change stops the prompter. */
  const resetPrompterRef = useRef<() => void>(() => {});

  // Server snapshot is false, so the first render is hydration-safe.
  const cameraAvailable = useSyncExternalStore(subscribeNever, canUseCamera, () => false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    () => false,
  );

  async function guard(
    run: () => Promise<void>,
    pane: PaneId = mode,
  ) {
    setError(null);
    setJob(clearFinishedJob);
    try {
      await run();
      setPaneError(null);
    } catch (cause) {
      const copy = errorCopyFor(cause);
      setError(copy);
      setPaneError({ pane, copy });
    }
  }

  /** Reloads the stored transcript and the proposals that describe it. */
  async function loadTranscriptState(projectRoot: string = root) {
    try {
      editing.reset(await getTranscript(projectRoot));
    } catch {
      editing.reset(null);
    }
    setSelection(null);

    try {
      const cleanup = await getCleanup(projectRoot);
      setProposals(cleanup.proposals);
    } catch {
      setProposals([]);
    }
    setAcceptance(DEFAULT_ACCEPTANCE);
  }

  // The root is passed in, not read from state: a caller that just set it would
  // otherwise fetch transcripts for the previous (or empty) project.
  async function loadProjectFiles(next: ProjectDocument, projectRoot: string = root) {
    setProject(next);
    await loadTranscriptState(projectRoot);

    try {
      const stored = await getScript(projectRoot);
      setScript(stored.script);
      setScriptSaved(stored.script);
    } catch {
      setScript("");
      setScriptSaved("");
    }

    resetPrompterRef.current();
    void refreshBrowser();
    setMessage(`Opened ${next.name}`);
  }

  /** Opens a project by path, for callers that already know which one. */
  function openProjectAt(target: string) {
    return guard(async () => {
      const opened = await getProject(target);
      setRoot(target);
      await loadProjectFiles(opened, target);
      changeMode(opened.media === undefined ? "ingest" : "edit");
      setTranscribeFailure(null);
      setBrowserError(null);
    }, "browser");
  }

  async function fetchBrowserListing(target?: string): Promise<void> {
    const listing = await listFolder(target);

    setBrowserPath(listing.path);
    setBrowserParent(listing.parent);
    setBrowserEntries(listing.entries);
    setBrowserError(null);
    browserPathRef.current = listing.path;

    // Remember where you were, so the next launch opens your work, not home.
    try {
      window.localStorage.setItem(BROWSER_PATH_KEY, listing.path);
    } catch {
      // Storage can be unavailable; browsing still works without it.
    }
  }

  function loadFolder(target?: string) {
    return guard(async () => {
      try {
        await fetchBrowserListing(target);
      } catch (cause) {
        setBrowserError(cause instanceof Error ? cause.message : String(cause));
      }
    }, "browser");
  }

  /** Reloads the browsed folder so project rows carry current summaries. */
  async function refreshBrowser(): Promise<void> {
    try {
      const current = browserPathRef.current;
      await fetchBrowserListing(current === "" ? undefined : current);
    } catch {
      // The listing is advisory; keep the last good rows.
    }
  }

  useEffect(() => {
    let remembered: string | undefined;
    try {
      remembered = window.localStorage.getItem(BROWSER_PATH_KEY) ?? undefined;
    } catch {
      remembered = undefined;
    }
    void (async () => {
      await loadFolder(remembered);
    })();
    // The browser loads once on mount; later navigation goes through loadFolder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reopen the last project and mode; a missing project falls back to the browser.
  useEffect(() => {
    const session = loadSession();
    if (session === null) {
      return;
    }

    void (async () => {
      try {
        const opened = await getProject(session.root);
        setRoot(session.root);
        await loadProjectFiles(opened, session.root);
        setMode(session.mode);
      } catch {
        clearSession();
        setMode("ingest");
        setMessage("That project could not be reopened. Choose another in the browser.");
      }
    })();
    // Restore once, before any user action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remember the open project and mode across reloads.
  useEffect(() => {
    if (project !== null && root !== "") {
      saveSession({ root, mode });
    }
  }, [project, root, mode]);

  /** A mode switch ends the previous workspace's status text. */
  function changeMode(next: WorkspaceMode) {
    setJob(clearFinishedJob);
    setMode(next);
  }

  /** Loads a folder for the media picker, with media files included. */
  async function loadPickerFolder(target?: string) {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const listing = await listFolder(target, { includeFiles: true });

      setPickerPath(listing.path);
      setPickerParent(listing.parent);
      setPickerEntries(listing.entries);
    } catch (cause) {
      setPickerError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPickerLoading(false);
    }
  }

  function openMediaPicker() {
    setPickerOpen(true);
    // Start where the project browser is, so the last place is reused.
    void loadPickerFolder(browserPath.trim() === "" ? undefined : browserPath);
  }

  /** Opens the full-screen Studio; the camera start lives in the Studio subtree. */
  function openStudio() {
    setStudioOpen(true);
  }

  /** A script change resets the prompter, exactly as the page did before. */
  function handleScriptChange(text: string) {
    setScript(text);
    resetPrompterRef.current();
  }

  function chooseMedia(filePath: string) {
    setPickerOpen(false);
    // Import starts at once; there is no second Import button.
    void importMedia(filePath);
  }

  /**
   * Copies a chosen file into the open project.
   *
   * The page stays in Ingest so the new media row and its Transcribe action
   * are visible without a mode change.
   */
  function importMedia(sourcePath: string) {
    return guard(async () => {
      const result = await importMediaApi(root, sourcePath);
      setProject(result.project);
      setTranscribeFailure(null);
      setMessage("Media imported");
      void refreshBrowser();
    }, "ingest");
  }

  // Save the script after a pause; the prompter keeps the text in memory meanwhile.
  useEffect(() => {
    if (project === null || root === "" || script === scriptSaved) {
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        try {
          await saveScript(root, script);
          setScriptSaved(script);
        } catch (cause) {
          setError(errorCopyFor(cause));
        }
      })();
    }, 600);

    return () => clearTimeout(handle);
  }, [script, scriptSaved, project, root]);

  function createProject(projectName: string) {
    return guard(async () => {
      // A project is a folder of its own, created inside the folder being
      // browsed. Slashes would nest it somewhere the user did not choose.
      const folder = projectName.trim().replace(/[\\/]+/g, "-");
      const createdRoot = `${browserPath.replace(/\/+$/, "")}/${folder}`;

      const created = await createProjectApi(createdRoot, projectName.trim());

      setRoot(createdRoot);
      await loadProjectFiles(created, createdRoot);
      changeMode("ingest");
      setTranscribeFailure(null);
      setMessage(`Created ${created.name}`);
      void loadFolder(browserPath);
    }, "browser");
  }

  const autoSave = useAutoSave({
    dirty: editing.dirty,
    revision: editing.document,
    save: async () => {
      await saveTranscriptDocument();
    },
    onError: (message) => setError(errorCopyFor(new Error(message))),
  });

  function saveTranscriptDocument() {
    if (transcript === null) {
      return Promise.resolve();
    }

    return guard(async () => {
      await saveTranscript(root, transcript);
      editing.markSaved();
      setMessage("Transcript saved");
      void refreshBrowser();
    }, "edit");
  }

  function transcribeMedia() {
    return guard(async () => {
      setTranscribeFailure(null);
      const started = await transcribe(root);
      setJob(started);

      const finished = await pollJob(started.id);
      setJob(finished);
      if (finished.status !== "done") {
        const detail = finished.error ?? `transcription ${finished.status}`;
        setTranscribeFailure(detail);
        throw new Error(detail);
      }

      await loadTranscriptState();
      void refreshBrowser();

      const result = finished.result as { words?: number } | null;
      setMessage(
        result?.words === undefined
          ? "Transcription finished"
          : `Transcribed ${result.words} words`,
      );
      // The transcript is the point of transcription; show it in Edit.
      changeMode("edit");
    });
  }

  function startBatch() {
    return guard(async () => {
      const roots = [...batchSelected];
      if (roots.length === 0) {
        return;
      }

      setBatchRunning(true);
      try {
        const started = await transcribeBatch(roots);

        setJob(started.job);
        setBatchOutcomes([]);
        setMessage(`${started.plan.items.length} projects planned`);

        const finished = await pollJob(started.job.id);
        const result = finished.result as {
          outcomes?: { root: string; status: string; detail?: string }[];
        } | null;
        const outcomes = result?.outcomes ?? [];
        setBatchOutcomes(outcomes);

        // The open project may be one of the batch, so refresh what the page shows.
        await loadTranscriptState();

        setMessage(
          `Batch ${finished.status}: ${
            outcomes.filter((outcome) => outcome.status === "transcribed").length
          } transcribed, ${outcomes.filter((outcome) => outcome.status === "failed").length} failed`,
        );
      } finally {
        setBatchRunning(false);
      }
    }, "ingest");
  }

  /** Fills the script from the current transcript, for a rehearse-and-reread pass. */
  function useTranscriptAsScript() {
    if (transcript === null) {
      setScript("");
      return;
    }

    const removed = new Set(transcript.removedWordIds);
    setScript(
      transcript.words
        .filter((word) => !removed.has(word.id))
        .map((word) => word.text)
        .join(" "),
    );
    resetPrompterRef.current();
  }

  function toggleBatch(target: string) {
    setBatchSelected((current) =>
      current.includes(target)
        ? current.filter((root) => root !== target)
        : [...current, target],
    );
  }

  // Undo/redo shortcuts are global, so they are ignored while a text field has
  // focus — otherwise typing in the storyboard editor would undo transcript cuts.
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoEdit();
        return;
      }

      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redoEdit();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [undoEdit, redoEdit]);

  /** Export is always one click away: open Deliver and focus its panel. */
  function openExport() {
    changeMode("deliver");
    requestAnimationFrame(() => document.getElementById("export-panel")?.focus());
  }

  const saveState: SaveState =
    transcript === null
      ? "none"
      : autoSave.saving
        ? "saving"
        : editing.dirty
          ? "unsaved"
          : "saved";

  const hasMedia = project?.media !== undefined;
  const scriptWords = countWords(script);

  // The batch dialog lists the projects in the folder the browser is showing,
  // so a batch never needs a typed path.
  const batchProjects = browserEntries
    .filter((entry) => entry.isProject)
    .map((entry) => ({ name: entry.summary?.name ?? entry.name, root: entry.path }));

  return (
    <>
      <BeforeUnloadGuard dirty={editing.dirty} />
      <main className="app" data-mode={mode}>
        <h1 className="sr-only">{project === null ? "Verbal" : project.name}</h1>
        <TopBar
          projectName={project?.name ?? null}
          projectRoot={root}
          mode={mode}
          saveState={saveState}
          onMode={changeMode}
          onExport={openExport}
        />

        <div className="workspace">
          <IngestWorkspace
            active={mode === "ingest"}
            project={project}
            root={root}
            transcript={transcript}
            transcribeFailure={transcribeFailure}
            hasEdits={
              transcript !== null &&
              (transcript.removedWordIds.length > 0 ||
                (transcript.silences?.length ?? 0) > 0 ||
                editing.canUndo)
            }
            script={script}
            paneError={paneError}
            onDismissPaneError={() => setPaneError(null)}
            onOpenMediaPicker={openMediaPicker}
            onOpenStudio={openStudio}
            onTranscribe={() => void transcribeMedia()}
            onOpenBatch={() => {
              setBatchSelected([]);
              setBatchOpen(true);
            }}
            onScriptChange={handleScriptChange}
            onUseTranscript={useTranscriptAsScript}
            onOpenInEdit={() => changeMode("edit")}
            onNewProject={() => void createProject("Untitled Project")}
          />

          <EditWorkspace
            active={mode === "edit"}
            root={root}
            project={project}
            transcript={transcript}
            selection={selection}
            setSelection={setSelection}
            editing={editing}
            proposals={proposals}
            acceptance={acceptance}
            setProposals={setProposals}
            setAcceptance={setAcceptance}
            setMessage={setMessage}
            guard={guard}
            paneError={paneError}
            onDismissPaneError={() => setPaneError(null)}
            onTranscribe={() => void transcribeMedia()}
            onGoToIngest={() => changeMode("ingest")}
          />

          <DeliverWorkspace
            active={mode === "deliver"}
            root={root}
            project={project}
            transcript={transcript}
            paneError={paneError}
            onDismissPaneError={() => setPaneError(null)}
            guard={guard}
            setMessage={setMessage}
            setError={setError}
            onGoToIngest={() => changeMode("ingest")}
            onTranscribe={() => void transcribeMedia()}
          />

          {/* DOM order is stage, then inspector, then browser: Tab reaches the
              transcript before the project rows. CSS `order` keeps the browser
              on the left. */}
          <aside className="sidebar" aria-label="Project browser">
            {paneError?.pane === "browser" && (
              <PaneAlert
                message={paneError.copy.message}
                detail={paneError.copy.detail}
                onDismiss={() => setPaneError(null)}
              />
            )}
            <ProjectBrowser
              path={browserPath}
              parent={browserParent}
              entries={browserEntries}
              loading={browserLoading}
              error={browserError}
              onCreate={(projectName) => void createProject(projectName)}
              onHome={() => void loadFolder()}
              onUp={() => {
                if (browserParent !== null) {
                  void loadFolder(browserParent);
                }
              }}
              onNavigate={(target) => {
                setBrowserLoading(true);
                void loadFolder(target).finally(() => setBrowserLoading(false));
              }}
              onOpen={(target) => {
                void openProjectAt(target);
              }}
              currentRoot={root}
            />
          </aside>
        </div>

        <StudioHost
          deps={{
            open: studioOpen,
            root,
            script,
            projectName: project?.name ?? null,
            words: scriptWords,
            readTime: formatReadTime(readTimeSeconds(scriptWords)),
            reducedMotion,
            cameraAvailable,
            mode,
            paneError,
            resetPrompterRef,
            onClose: () => setStudioOpen(false),
            onScriptChange: handleScriptChange,
            onUseTranscript: useTranscriptAsScript,
            onDismissError: () => setPaneError(null),
            setMessage,
            setJob,
            setProject,
            pollJob,
            guard,
          }}
        />

        {pickerOpen && (
          <MediaPicker
            path={pickerPath}
            parent={pickerParent}
            entries={pickerEntries}
            loading={pickerLoading}
            error={pickerError}
            onChoose={chooseMedia}
            onClose={() => setPickerOpen(false)}
            onHome={() => void loadPickerFolder()}
            onUp={() => {
              if (pickerParent !== null) {
                void loadPickerFolder(pickerParent);
              }
            }}
            onNavigate={(target) => void loadPickerFolder(target)}
          />
        )}

        {batchOpen && (
          <BatchDialog
            projects={batchProjects}
            selected={batchSelected}
            running={batchRunning}
            outcomes={batchOutcomes}
            onToggle={toggleBatch}
            onStart={() => void startBatch()}
            onClose={() => setBatchOpen(false)}
          />
        )}

        <JobStatusBar
          mediaLabel={hasMedia ? "Media loaded" : "No media"}
          message={message}
          error={error}
        />
      </main>
    </>
  );
}

/** Test-only render counter; undefined outside the test environment. */
export const __homeRenderCounter =
  process.env.NODE_ENV === "test"
    ? {
        get count(): number {
          return homeRenderCount;
        },
        reset(): void {
          homeRenderCount = 0;
        },
      }
    : undefined;
