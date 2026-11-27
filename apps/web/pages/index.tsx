import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  searchTranscript,
  type JobRecord,
  type ProjectDocument,
  type TranscriptDocument,
} from "@verbal/core/browser";
import {
  applyAcceptedPatches,
  parsePatchResponse,
  parseStoryboard,
  storyboardFromTranscript,
  type StoryboardDocument,
  type StoryboardPatch,
} from "@verbal/storyboard";
import {
  alignTake,
  countWords,
  formatReadTime,
  readTimeSeconds,
  splitBeats,
  type BeatProposal,
  type BeatStatus,
  type TakeAlignment,
} from "@verbal/takes";
import type { PreviewPlan, PreviewTier } from "@verbal/compose";
import type { MediaInfo } from "@verbal/media";
import {
  DEFAULT_PRESET_ID,
  EXPORT_PRESETS,
  withPresetExtension,
  type ExportPresetId,
} from "@verbal/media/presets";
import {
  DEFAULT_ACCEPTANCE,
  resolveAccepted,
  type Acceptance,
  type CleanupProposal,
} from "@verbal/cleanup";
import { errorCopyFor, type ErrorCopy } from "../lib/error-copy";
import { MediaPicker } from "../components/MediaPicker";
import { IngestStage, type MediaState } from "../components/IngestStage";
import { IngestInspector, type ProbeSummary } from "../components/IngestInspector";
import { ExportControls } from "../components/ExportControls";
import { clearFinishedJob, jobStatusText } from "../components/job-status";
import { BatchDialog } from "../components/BatchDialog";
import { PaneAlert } from "../components/PaneAlert";
import {
  StudioOverlay,
  type StudioDevice,
  type StudioTake,
} from "../components/StudioOverlay";
import { CaptureRecorder, type MediaRecorderLike } from "../lib/capture-recorder";
import type { ReviewProposalView } from "../components/TakeReview";
import { ScriptEditor } from "../components/ScriptEditor";
import {
  advanceWords,
  clampFontSize,
  clampWpm,
  DEFAULT_FONT,
  DEFAULT_WPM,
} from "../components/prompter-clock";
import { clearSession, loadSession, saveSession } from "../lib/session";
import { CleanupReview } from "../components/CleanupReview";
import { PlaybackScreen } from "../components/PlaybackScreen";
import { TopBar, type SaveState, type WorkspaceMode } from "../components/TopBar";
import { ProjectBrowser } from "../components/ProjectBrowser";
import { EmptyState } from "../components/EmptyState";
import type { FsEntry } from "../server/fs-api";
import { PatchReview } from "../components/PatchReview";
import { StoryboardPreview } from "../components/StoryboardPreview";
import { TranscriptEditor, type WordSelection } from "../components/TranscriptEditor";
import { useAutoSave } from "../hooks/use-auto-save";
import { useTranscriptDocument } from "../hooks/use-transcript-document";

const GEOMETRY = { fps: 30, width: 1280, height: 720 };

/** Remembers the folder you were browsing, so launch lands on your work. */
const BROWSER_PATH_KEY = "verbal.browser.path";

/** A sensible export destination inside the project, so a path is never typed. */
/** FileReader avoids building a huge binary string by hand. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      // The MIME type can contain a comma ("codecs=vp9,opus"), so split on the
      // ;base64, marker rather than the first comma.
      const marker = ";base64,";
      const index = result.indexOf(marker);
      resolve(index === -1 ? "" : result.slice(index + marker.length));
    };
    reader.onerror = () => reject(reader.error ?? new Error("could not read the recording"));
    reader.readAsDataURL(blob);
  });
}

function defaultOutputPath(
  projectRoot: string,
  projectName: string,
  presetId: ExportPresetId,
): string {
  const extension = EXPORT_PRESETS.find((preset) => preset.id === presetId)?.extension ?? "mp4";
  const name = projectName.trim().replace(/[\\/]+/g, "-") || "export";
  return `${projectRoot.replace(/\/+$/, "")}/exports/${name}.${extension}`;
}

/** The absolute media path a probe needs, from the project document. */
function projectMediaPath(
  project: ProjectDocument | null,
  projectRoot: string,
): string | null {
  if (project?.media === undefined) {
    return null;
  }
  if (project.media.externalPath !== undefined) {
    return project.media.externalPath;
  }
  if (project.media.assetPath !== undefined) {
    return `${projectRoot.replace(/\/+$/, "")}/${project.media.assetPath}`;
  }
  return null;
}

function projectMediaName(project: ProjectDocument | null): string | null {
  const target = project?.media?.assetPath ?? project?.media?.externalPath;
  if (target === undefined) {
    return null;
  }
  return target.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? null;
}

/** Narrows a probe result to the fields the inspector shows. */
function toProbeSummary(info: MediaInfo): ProbeSummary {
  const video = info.streams.find((stream) => stream.kind === "video") ?? null;
  const audio = info.streams.find((stream) => stream.kind === "audio") ?? null;
  return {
    durationSeconds: info.durationSeconds,
    sizeBytes: info.sizeBytes,
    videoCodec: video?.codec ?? null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    frameRate: video?.frameRate ?? null,
    audioCodec: audio?.codec ?? null,
    channels: audio?.channels ?? null,
    sampleRate: audio?.sampleRate ?? null,
  };
}


async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function putJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

export default function Home() {
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
  const [prompterOffset, setPrompterOffset] = useState(0);
  const [prompterWpm, setPrompterWpm] = useState(DEFAULT_WPM);
  const [prompterFontSize, setPrompterFontSize] = useState(DEFAULT_FONT);
  const [prompterMirror, setPrompterMirror] = useState(false);
  const [prompterPlaying, setPrompterPlaying] = useState(false);
  const scriptBeats = splitBeats(script);

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
  const [silenceSeconds, setSilenceSeconds] = useState(1);
  const [query, setQuery] = useState("");
  const [matchCursor, setMatchCursor] = useState(0);
  const [acceptance, setAcceptance] = useState<Acceptance>(DEFAULT_ACCEPTANCE);
  const [storyboardText, setStoryboardText] = useState("");
  const [tier, setTier] = useState<PreviewTier>("fast");
  const [plan, setPlan] = useState<PreviewPlan | null>(null);
  const [patchText, setPatchText] = useState("");
  const [patches, setPatches] = useState<StoryboardPatch[]>([]);
  const [accepted, setAccepted] = useState<boolean[]>([]);
  const [probe, setProbe] = useState<ProbeSummary | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [transcription, setTranscription] = useState<{
    label: string;
    cloud: boolean;
    hint?: string;
  }>({
    label: "Cloud (OpenAI-compatible)",
    cloud: true,
  });
  const [studioOpen, setStudioOpen] = useState(false);
  const [transcribeFailure, setTranscribeFailure] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState("");
  const [presetId, setPresetId] = useState<ExportPresetId>(DEFAULT_PRESET_ID);
  const [prunable, setPrunable] = useState<string[] | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>("ingest");
  const [playerCollapsed, setPlayerCollapsed] = useState(false);
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const [brand, setBrand] = useState({
    title: "",
    outro: "",
    contact: "",
    loudness: -16,
  });
  const [includeBrand, setIncludeBrand] = useState(true);
  const brandTitleProjectRef = useRef<string | null>(null);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [error, setError] = useState<ErrorCopy | null>(null);
  const [paneError, setPaneError] = useState<{
    pane: "browser" | "ingest" | "edit" | "deliver";
    copy: ErrorCopy;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [takeState, setTakeState] = useState<
    "idle" | "countdown" | "recording" | "uploading"
  >("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [takes, setTakes] = useState<StudioTake[]>([]);
  const [review, setReview] = useState<{
    takeId: string;
    alignment: TakeAlignment;
  } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [llmReview, setLlmReview] = useState<{
    takeId: string;
    provider: string | null;
    estimate: { tokens: number; cost: number } | null;
    proposals: ReviewProposalView[];
    running: boolean;
  } | null>(null);
  const [rereadTarget, setRereadTarget] = useState<string | null>(null);
  const [cut, setCut] = useState<{
    ranges: number;
    durationSeconds: number;
    building: boolean;
  } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [cameras, setCameras] = useState<StudioDevice[]>([]);
  const [microphones, setMicrophones] = useState<StudioDevice[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [microphoneId, setMicrophoneId] = useState<string | null>(null);
  const recorderRef = useRef<CaptureRecorder | null>(null);
  const takeStartRef = useRef<number | null>(null);
  const takeCancelledRef = useRef(false);
  const [imageSceneId, setImageSceneId] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageCost, setImageCost] = useState<number | null>(null);
  const [videoSceneId, setVideoSceneId] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoSeconds, setVideoSeconds] = useState(4);
  const [videoCost, setVideoCost] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Server snapshot is false, so the first render is hydration-safe.
  const cameraAvailable = useSyncExternalStore(subscribeNever, canUseCamera, () => false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    () => false,
  );

  async function guard(
    run: () => Promise<void>,
    pane: "browser" | "ingest" | "edit" | "deliver" = mode,
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
      editing.reset(
        await request<TranscriptDocument>(
          `/api/transcript?root=${encodeURIComponent(projectRoot)}`,
        ),
      );
    } catch {
      editing.reset(null);
    }
    setSelection(null);

    try {
      const cleanup = await request<{ proposals: CleanupProposal[] }>(
        `/api/cleanup?root=${encodeURIComponent(projectRoot)}`,
      );
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
    if (brandTitleProjectRef.current !== projectRoot) {
      brandTitleProjectRef.current = projectRoot;
      setBrand((current) => ({ ...current, title: next.name }));
    }
    setOutputPath(defaultOutputPath(projectRoot, next.name, presetId));

    await loadTranscriptState(projectRoot);

    const storyboard = await request<StoryboardDocument>(
      `/api/storyboard?root=${encodeURIComponent(projectRoot)}`,
    );
    setStoryboardText(JSON.stringify(storyboard, null, 2));

    // The plan belongs to one project: drop the last one, then restore this
    // project's scene list. The fast tier never starts a render, so reopening
    // a project costs nothing and Deliver is not empty after a reload.
    setPlan(null);
    if (storyboard.scenes.length > 0) {
      try {
        setTier("fast");
        setPlan(
          await postJson<PreviewPlan>("/api/storyboard/preview", {
            root: projectRoot,
            tier: "fast",
            version: 1,
            geometry: GEOMETRY,
          }),
        );
      } catch {
        // The Render Preview button stays as the way to try again.
      }
    }

    try {
      const stored = await request<{ script: string }>(
        `/api/script?root=${encodeURIComponent(projectRoot)}`,
      );
      setScript(stored.script);
      setScriptSaved(stored.script);
    } catch {
      setScript("");
      setScriptSaved("");
    }

    try {
      const result = await request<{ takes: StudioTake[] }>(
        `/api/takes?root=${encodeURIComponent(projectRoot)}`,
      );
      setTakes(result.takes);
    } catch {
      setTakes([]);
    }
    setPrompterOffset(0);
    setPrompterPlaying(false);

    void refreshBrowser();
    setMessage(`Opened ${next.name}`);
  }

  /** Opens a project by path, for callers that already know which one. */
  function openProjectAt(target: string) {
    return guard(async () => {
      const opened = await request<ProjectDocument>(
        `/api/projects?root=${encodeURIComponent(target)}`,
      );
      setRoot(target);
      await loadProjectFiles(opened, target);
      changeMode(opened.media === undefined ? "ingest" : "edit");
      setTranscribeFailure(null);
      setBrowserError(null);
    }, "browser");
  }

  async function fetchBrowserListing(target?: string): Promise<void> {
    const listing = await request<{
      path: string;
      parent: string | null;
      entries: FsEntry[];
    }>(`/api/fs/list${target === undefined ? "" : `?path=${encodeURIComponent(target)}`}`);

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
        const opened = await request<ProjectDocument>(
          `/api/projects?root=${encodeURIComponent(session.root)}`,
        );
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

  const runningJob =
    job !== null && (job.status === "queued" || job.status === "running");

  // Warn before leaving while an edit is unsaved or a job is running.
  useEffect(() => {
    if (!editing.dirty && !runningJob) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing.dirty, runningJob]);

  /** Loads a folder for the media picker, with media files included. */
  async function loadPickerFolder(target?: string) {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const listing = await request<{
        path: string;
        parent: string | null;
        entries: FsEntry[];
      }>(
        `/api/fs/list?includeFiles=1${
          target === undefined ? "" : `&path=${encodeURIComponent(target)}`
        }`,
      );

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

  /** Opens the full-screen Studio and starts the camera when one is available. */
  function stopPreview() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setPreviewing(false);
  }

  function openStudio() {
    setStudioOpen(true);
    requestAnimationFrame(() => {
      if (cameraAvailable && !previewing) {
        void startPreview();
      } else {
        void refreshDevices();
      }
    });
  }

  function closeStudio() {
    takeCancelledRef.current = true;
    if (takeState === "recording") {
      void stopTake();
    }
    setStudioOpen(false);
    setTakeState("idle");
    setCountdown(null);
    setElapsedSeconds(0);
    setPrompterPlaying(false);
    setRereadTarget(null);
    setLlmReview(null);
    setCut(null);
    setRendering(false);
    stopPreview();
  }

  function changeCamera(id: string) {
    setCameraId(id === "" ? null : id);
    stopPreview();
  }

  function changeMicrophone(id: string) {
    setMicrophoneId(id === "" ? null : id);
    stopPreview();
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
      const result = await postJson<{ project: ProjectDocument }>("/api/media/import", {
        projectRoot: root,
        sourcePath,
        mode: "copy",
      });
      setProject(result.project);
      setTranscribeFailure(null);
      setMessage("Media imported");
      void refreshBrowser();
    }, "ingest");
  }

  // The inspector reads one probe result per project, injected so the UI can be
  // tested without ffprobe. Re-probe when the project changes (including import).
  useEffect(() => {
    const mediaPath = projectMediaPath(project, root);
    let cancelled = false;

    void (async () => {
      if (mediaPath === null) {
        if (!cancelled) {
          setProbe(null);
          setProbeError(null);
          setProbeLoading(false);
        }
        return;
      }

      setProbe(null);
      setProbeError(null);
      setProbeLoading(true);
      try {
        const info = await postJson<MediaInfo>("/api/media/probe", { path: mediaPath });
        if (!cancelled) {
          setProbe(toProbeSummary(info));
        }
      } catch (cause) {
        if (!cancelled) {
          setProbeError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (!cancelled) {
          setProbeLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project, root]);

  // The environment picks the provider; the stage names it before transcribing.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const system = await request<{
          transcription?: { label: string; cloud: boolean; hint?: string };
        }>("/api/system");
        if (!cancelled && system.transcription !== undefined) {
          setTranscription(system.transcription);
        }
      } catch {
        // Keep the default label; transcription still works through the API.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Save the script after a pause; the prompter keeps the text in memory meanwhile.
  useEffect(() => {
    if (project === null || root === "" || script === scriptSaved) {
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        try {
          await putJson<{ script: string }>("/api/script", { root, script });
          setScriptSaved(script);
        } catch (cause) {
          setError(errorCopyFor(cause));
        }
      })();
    }, 600);

    return () => clearTimeout(handle);
  }, [script, scriptSaved, project, root]);

  // A steady clock advances the prompter. The offset at the start of a run is
  // captured so a tick never resets the elapsed time.
  useEffect(() => {
    if (!prompterPlaying) {
      return;
    }

    const start = { words: prompterOffset, at: performance.now() };
    const handle = setInterval(() => {
      const elapsed = (performance.now() - start.at) / 1000;
      setPrompterOffset(advanceWords(start.words, prompterWpm, elapsed));
    }, 100);

    return () => clearInterval(handle);
    // The offset at the start of a run is captured in `start`; adding it to the
    // dependencies would restart the clock on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompterPlaying, prompterWpm]);

  // Show elapsed time while a take records, without polling the job.
  useEffect(() => {
    if (takeState !== "recording") {
      return;
    }
    const handle = setInterval(() => {
      if (takeStartRef.current !== null) {
        setElapsedSeconds((performance.now() - takeStartRef.current) / 1000);
      }
    }, 250);
    return () => clearInterval(handle);
  }, [takeState]);

  // Leaving Ingest unmounts the camera element; stop the stream so the light
  // does not stay on behind an invisible preview.
  useEffect(() => {
    if (mode !== "ingest") {
      // Stopping the stream is the external side effect; the preview flag
      // follows the device, so update it after the render rather than in it.
      queueMicrotask(stopPreview);
    }
    // Only a mode change should stop capture; the stream functions are stable
    // enough for this purpose and stopping twice is harmless.
  }, [mode]);

  function createProject(projectName: string) {
    return guard(async () => {
      // A project is a folder of its own, created inside the folder being
      // browsed. Slashes would nest it somewhere the user did not choose.
      const folder = projectName.trim().replace(/[\\/]+/g, "-");
      const createdRoot = `${browserPath.replace(/\/+$/, "")}/${folder}`;

      const created = await postJson<ProjectDocument>("/api/projects", {
        root: createdRoot,
        name: projectName.trim(),
      });

      setRoot(createdRoot);
      await loadProjectFiles(created, createdRoot);
      changeMode("ingest");
      setTranscribeFailure(null);
      setMessage(`Created ${created.name}`);
      void loadFolder(browserPath);
    }, "browser");
  }

  /** Builds the first storyboard from the transcript, then previews it. */
  function createStoryboard() {
    return guard(async () => {
      if (transcript === null) {
        return;
      }

      const document = storyboardFromTranscript(transcript);
      const saved = await putJson<StoryboardDocument>("/api/storyboard", { root, document });
      setStoryboardText(JSON.stringify(saved, null, 2));
      setMessage(
        `Created ${saved.scenes.length} ${
          saved.scenes.length === 1 ? "scene" : "scenes"
        } from the transcript`,
      );
      await preview("full");
    });
  }

  function saveStoryboard() {
    return guard(async () => {
      const document = parseStoryboard(storyboardText);
      const saved = await putJson<StoryboardDocument>("/api/storyboard", { root, document });
      setStoryboardText(JSON.stringify(saved, null, 2));
      setMessage("Storyboard saved");
    });
  }

  const autoSave = useAutoSave({
    dirty: editing.dirty,
    revision: editing.document,
    save: async () => {
      await saveTranscriptDocument();
    },
    onError: (message) => setError(errorCopyFor(new Error(message))),
  });

  function checkPrunableAssets() {
    return guard(async () => {
      const result = await postJson<{ plan: { prune: string[] } }>("/api/storyboard/prune", {
        root,
      });
      setPrunable(result.plan.prune);
      setMessage(
        result.plan.prune.length === 0
          ? "No generated assets are prunable"
          : `${result.plan.prune.length} generated assets are prunable`,
      );
    });
  }

  function deletePrunableAssets() {
    return guard(async () => {
      const result = await postJson<{ deleted: string[] }>("/api/storyboard/prune", {
        root,
        apply: true,
      });
      setPrunable(null);
      setMessage(`Deleted ${result.deleted.length} generated assets`);
    });
  }

  function saveTranscriptDocument() {
    if (transcript === null) {
      return Promise.resolve();
    }

    return guard(async () => {
      await putJson<TranscriptDocument>("/api/transcript", { root, document: transcript });
      editing.markSaved();
      setMessage("Transcript saved");
      void refreshBrowser();
    }, "edit");
  }

  const matches = useMemo(
    () => (transcript === null ? [] : searchTranscript(transcript, query)),
    [transcript, query],
  );

  /** A parsed, empty storyboard is the first-run Deliver state. */
  const storyboardEmpty = useMemo(() => {
    try {
      return parseStoryboard(storyboardText).scenes.length === 0;
    } catch {
      return false;
    }
  }, [storyboardText]);

  function stepMatch(direction: 1 | -1) {
    if (matches.length === 0) {
      return;
    }

    const next = (matchCursor + direction + matches.length) % matches.length;
    setMatchCursor(next);

    const match = matches[next];
    if (match !== undefined) {
      setSelection({ fromIndex: match.fromIndex, toIndex: match.toIndex });
    }
  }

  const transcribing =
    job !== null &&
    job.kind === "transcribe" &&
    (job.status === "queued" || job.status === "running");

  function transcribeMedia() {
    return guard(async () => {
      setTranscribeFailure(null);
      const started = await postJson<JobRecord>("/api/transcribe", { projectRoot: root });
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

  function startBatch() {
    return guard(async () => {
      const roots = [...batchSelected];
      if (roots.length === 0) {
        return;
      }

      setBatchRunning(true);
      try {
        const started = await postJson<{
          plan: { items: unknown[] };
          job: JobRecord;
        }>("/api/transcribe/batch", { roots });

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
    setPrompterOffset(0);
    setPrompterPlaying(false);
  }

  function toggleBatch(target: string) {
    setBatchSelected((current) =>
      current.includes(target)
        ? current.filter((root) => root !== target)
        : [...current, target],
    );
  }

  function deleteSelection() {
    if (selection === null) {
      return;
    }

    editing.removeRange(selection.fromIndex, selection.toIndex);
    setSelection(null);
  }

  const acceptedProposals = resolveAccepted(proposals, acceptance);

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
      }. Save the transcript to keep it.`,
    );
  }

  function freezeMaster() {
    return guard(async () => {
      const { master } = await postJson<{
        master: { masterDurationSeconds: number; anchorWords: unknown[]; fingerprint: string };
      }>("/api/cleanup/freeze", { root });

      setMessage(
        `Frozen master: ${master.masterDurationSeconds.toFixed(2)}s · ` +
          `${master.anchorWords.length} anchors · ${master.fingerprint.slice(0, 8)}`,
      );
    });
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

  function preview(nextTier: PreviewTier) {
    return guard(async () => {
      setTier(nextTier);
      const next = await postJson<PreviewPlan>("/api/storyboard/preview", {
        root,
        tier: nextTier,
        version: (plan?.version ?? 0) + 1,
        geometry: GEOMETRY,
      });
      setPlan(next);
    });
  }

  function parsePatches() {
    try {
      const parsed = parsePatchResponse(patchText);
      setPatches(parsed);
      setAccepted(parsed.map(() => true));
      setError(null);
      setMessage(`${parsed.length} hunks parsed`);
    } catch (cause) {
      setError(errorCopyFor(cause));
    }
  }

  function applyPatches() {
    return guard(async () => {
      const document = parseStoryboard(storyboardText);
      const next = applyAcceptedPatches(document, patches, accepted);
      const saved = await putJson<StoryboardDocument>("/api/storyboard", { root, document: next });
      setStoryboardText(JSON.stringify(saved, null, 2));
      setPatches([]);
      setAccepted([]);
      setMessage("Patches applied");
    });
  }

  async function pollJob(id: string): Promise<JobRecord> {
    let record = await request<JobRecord>(`/api/jobs/${id}`);
    setJob(record);

    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (record.status !== "queued" && record.status !== "running") {
        return record;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      record = await request<JobRecord>(`/api/jobs/${id}`);
      setJob(record);
    }

    return record;
  }

  async function refreshDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(
        devices
          .filter((device) => device.kind === "videoinput")
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${index + 1}`,
          })),
      );
      setMicrophones(
        devices
          .filter((device) => device.kind === "audioinput")
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${index + 1}`,
          })),
      );
    } catch {
      // Labels need permission; the default device still works without them.
    }
  }

  async function ensureStream(): Promise<MediaStream> {
    if (streamRef.current !== null) {
      return streamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: cameraId === null ? true : { deviceId: { exact: cameraId } },
      audio: microphoneId === null ? true : { deviceId: { exact: microphoneId } },
    });
    streamRef.current = stream;

    if (videoRef.current !== null) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setPreviewing(true);
    await refreshDevices();
    return stream;
  }

  function startPreview() {
    return guard(async () => {
      await ensureStream();
    });
  }

  function startTake() {
    return guard(async () => {
      if (takeState !== "idle") {
        return;
      }

      takeCancelledRef.current = false;
      const stream = await ensureStream();
      setTakeState("countdown");

      for (let remaining = 3; remaining >= 1; remaining -= 1) {
        if (takeCancelledRef.current) {
          setCountdown(null);
          setTakeState("idle");
          return;
        }
        setCountdown(remaining);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setCountdown(null);

      if (takeCancelledRef.current) {
        setTakeState("idle");
        return;
      }

      const recorder = new CaptureRecorder();
      recorder.start(
        stream,
        (mediaStream, mimeType) =>
          new MediaRecorder(mediaStream, { mimeType }) as unknown as MediaRecorderLike,
        (mimeType) => MediaRecorder.isTypeSupported(mimeType),
      );
      recorderRef.current = recorder;
      takeStartRef.current = performance.now();
      setElapsedSeconds(0);
      setTakeState("recording");
      setPrompterPlaying(true);
    });
  }

  function stopTake() {
    return guard(async () => {
      const recorder = recorderRef.current;
      if (recorder === null) {
        return;
      }

      setTakeState("uploading");
      setPrompterPlaying(false);
      setCountdown(null);

      const blob = await recorder.stop();
      recorderRef.current = null;
      const duration =
        takeStartRef.current === null
          ? 0
          : Math.max(0.1, (performance.now() - takeStartRef.current) / 1000);
      takeStartRef.current = null;
      const takeId = `take-${Date.now()}`;

      const dataBase64 = await blobToBase64(blob);
      const response = await fetch("/api/takes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root,
          takeId,
          durationSeconds: Number(duration.toFixed(3)),
          dataBase64,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `upload ${response.status}`);
      }

      const job = (await response.json()) as JobRecord;
      setJob(job);
      const finished = await pollJob(job.id);
      if (finished.status !== "done") {
        throw new Error(finished.error ?? `normalize ${finished.status}`);
      }

      const saved = await request<{ takes: StudioTake[] }>(
        `/api/takes?root=${encodeURIComponent(root)}`,
      );
      setTakes(saved.takes);
      setProject(
        await request<ProjectDocument>(`/api/projects?root=${encodeURIComponent(root)}`),
      );
      setMessage("Take saved");
      setRereadTarget(null);
      setLlmReview(null);
      setCut(null);
    setRendering(false);
      setRendering(false);
      setTakeState("idle");
      setElapsedSeconds(0);
    });
  }

  function reviewTake(takeId: string) {
    return guard(async () => {
      setReviewing(true);
      const started = await postJson<JobRecord>("/api/take-transcript", { root, takeId });
      setJob(started);

      const finished = await pollJob(started.id);
      if (finished.status !== "done") {
        throw new Error(finished.error ?? `transcribe ${finished.status}`);
      }

      const saved = await request<{
        words: { text: string; start: number; end: number }[];
      }>(
        `/api/take-transcript?root=${encodeURIComponent(root)}&takeId=${encodeURIComponent(takeId)}`,
      );
      setReview({ takeId, alignment: alignTake(scriptBeats, saved.words) });
      setLlmReview(null);
      setRereadTarget(null);
      setCut(null);
    setRendering(false);
      setRendering(false);
    }).finally(() => setReviewing(false));
  }

  function rereadBeat(beatId: string) {
    const beatIndex = scriptBeats.findIndex((beat) => beat.id === beatId);
    const offset = scriptBeats
      .slice(0, Math.max(0, beatIndex))
      .reduce((sum, beat) => sum + beat.wordCount, 0);
    setPrompterOffset(offset);
    setPrompterPlaying(true);
    setRereadTarget(beatId);
    setMessage(`Reread from ${beatId}`);
  }

  function overrideReviewStatus(beatId: string, status: BeatStatus) {
    setReview((current) =>
      current === null
        ? current
        : {
            ...current,
            alignment: {
              beats: current.alignment.beats.map((beat) =>
                beat.beatId === beatId ? { ...beat, status } : beat,
              ),
            },
          },
    );
  }

  function seekReview(seconds: number) {
    setMessage(`Take at ${seconds.toFixed(1)}s`);
  }

  function previewEdits(takeId: string) {
    return guard(async () => {
      const preview = await request<{
        provider: string;
        estimate: { tokens: number; cost: number };
      }>(
        `/api/take-review?root=${encodeURIComponent(root)}&takeId=${encodeURIComponent(takeId)}`,
      );
      setLlmReview({
        takeId,
        provider: preview.provider,
        estimate: preview.estimate,
        proposals: [],
        running: false,
      });
    });
  }

  function runEdits(takeId: string) {
    return guard(async () => {
      setLlmReview((current) =>
        current === null ? current : { ...current, running: true },
      );
      const result = await postJson<{
        provider: string;
        proposals: BeatProposal[];
      }>("/api/take-review", { root, takeId, confirm: true });
      setLlmReview((current) =>
        current === null
          ? current
          : {
              ...current,
              running: false,
              provider: result.provider,
              proposals: result.proposals.map((proposal) => ({
                ...proposal,
                selected: proposal.action !== "keep",
              })),
            },
      );
    });
  }

  function toggleProposal(beatId: string) {
    setLlmReview((current) =>
      current === null
        ? current
        : {
            ...current,
            proposals: current.proposals.map((proposal) =>
              proposal.beatId === beatId
                ? { ...proposal, selected: !proposal.selected }
                : proposal,
            ),
          },
    );
  }

  function applyProposals() {
    if (llmReview === null) {
      return;
    }
    const actions = new Map(
      llmReview.proposals
        .filter((proposal) => proposal.selected)
        .map((proposal) => [proposal.beatId, proposal.action]),
    );
    setReview((current) =>
      current === null
        ? current
        : {
            ...current,
            alignment: {
              beats: current.alignment.beats.map((beat) => {
                const action = actions.get(beat.beatId);
                if (action === undefined) {
                  return beat;
                }
                const status: BeatStatus =
                  action === "cut" ? "skipped" : action === "reread" ? "bungled" : "good";
                return { ...beat, status };
              }),
            },
          },
    );
    setLlmReview(null);
  }

  function dismissProposals() {
    setLlmReview(null);
  }

  function buildCut(takeId: string) {
    return guard(async () => {
      setCut({ ranges: 0, durationSeconds: 0, building: true });
      const result = await postJson<{
        ranges: { startSeconds: number; endSeconds: number }[];
        durationSeconds: number;
      }>("/api/assembly", { root, takeId });
      setCut({
        ranges: result.ranges.length,
        durationSeconds: result.durationSeconds,
        building: false,
      });
      setMessage(
        `Cut: ${result.ranges.length} ${
          result.ranges.length === 1 ? "range" : "ranges"
        } · ${result.durationSeconds.toFixed(1)}s`,
      );
    }).finally(() => {
      setCut((current) =>
        current === null ? current : { ...current, building: false },
      );
    });
  }

  function renderCut(takeId: string) {
    return guard(async () => {
      setRendering(true);
      const started = await postJson<JobRecord>("/api/assembly", {
        root,
        takeId,
        render: true,
      });
      setJob(started);
      const finished = await pollJob(started.id);
      if (finished.status !== "done") {
        throw new Error(finished.error ?? `render ${finished.status}`);
      }
      setProject(
        await request<ProjectDocument>(
          `/api/projects?root=${encodeURIComponent(root)}`,
        ),
      );
      setMessage("Cut rendered");
    }).finally(() => setRendering(false));
  }

  /** Export is always one click away: open Deliver and focus its panel. */
  function openExport() {
    changeMode("deliver");
    requestAnimationFrame(() => document.getElementById("export-panel")?.focus());
  }

  function exportStoryboard() {
    return guard(async () => {
      const record = await postJson<JobRecord>("/api/storyboard/export", {
        root,
        outputPath,
        preset: presetId,
        includeBrand,
        brand: {
          title: { text: includeBrand ? brand.title : project?.name ?? "Export" },
          outro: { text: brand.outro },
          contact: { name: brand.contact },
          lowerThird: { name: brand.contact },
          loudnessLufs: brand.loudness,
        },
        geometry: GEOMETRY,
      });
      setJob(record);
      const finished = await pollJob(record.id);
      const result = finished.result as { outputPath?: string } | null;
      if (result?.outputPath !== undefined) {
        setOutputPath(result.outputPath);
        setMessage(`Exported to ${result.outputPath}`);
      }
    });
  }

  function estimateImage() {
    return guard(async () => {
      const result = await postJson<{ estimate: number; provider: string }>(
        "/api/storyboard/generate-image",
        { root, sceneId: imageSceneId, prompt: imagePrompt, dryRun: true },
      );
      setImageCost(result.estimate);
      setMessage(`Estimated cost: $${result.estimate.toFixed(2)} (${result.provider})`);
    });
  }

  function generateImage() {
    return guard(async () => {
      const result = await postJson<{
        assetId: string;
        cost: number;
        document: StoryboardDocument;
      }>("/api/storyboard/generate-image", {
        root,
        sceneId: imageSceneId,
        prompt: imagePrompt,
      });
      setStoryboardText(JSON.stringify(result.document, null, 2));
      setImageCost(result.cost);
      setMessage(
        `Generated image ${result.assetId.slice(0, 8)} for $${result.cost.toFixed(2)}`,
      );
    });
  }

  function estimateVideo() {
    return guard(async () => {
      const result = await postJson<{ estimate: number; provider: string }>(
        "/api/storyboard/generate-video",
        {
          root,
          sceneId: videoSceneId,
          prompt: videoPrompt,
          durationSeconds: videoSeconds,
          dryRun: true,
        },
      );
      setVideoCost(result.estimate);
      setMessage(`Estimated clip cost: $${result.estimate.toFixed(2)} (${result.provider})`);
    });
  }

  function generateVideo() {
    return guard(async () => {
      const record = await postJson<JobRecord>("/api/storyboard/generate-video", {
        root,
        sceneId: videoSceneId,
        prompt: videoPrompt,
        durationSeconds: videoSeconds,
      });
      setJob(record);
      await pollJob(record.id);

      const storyboard = await request<StoryboardDocument>(
        `/api/storyboard?root=${encodeURIComponent(root)}`,
      );
      setStoryboardText(JSON.stringify(storyboard, null, 2));
      setMessage("Clip generated");
    });
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
  const liveWords =
    transcript === null ? 0 : transcript.words.length - transcript.removedWordIds.length;
  const scriptWords = countWords(script);

  const mediaState: MediaState = (() => {
    if (!hasMedia) {
      return { kind: "none" };
    }
    if (transcribing) {
      return { kind: "transcribing", progress: job?.progress ?? 0 };
    }
    if (transcribeFailure !== null) {
      return { kind: "failed", detail: transcribeFailure };
    }
    if (transcript !== null && liveWords > 0) {
      return { kind: "transcribed", words: liveWords };
    }
    return { kind: "untranscribed" };
  })();

  // The batch dialog lists the projects in the folder the browser is showing,
  // so a batch never needs a typed path.
  const batchProjects = browserEntries
    .filter((entry) => entry.isProject)
    .map((entry) => ({ name: entry.summary?.name ?? entry.name, root: entry.path }));

  const dimmedBeatIds =
    rereadTarget === null
      ? []
      : scriptBeats
          .filter((beat) => beat.id !== rereadTarget)
          .filter(
            (beat) =>
              review?.alignment.beats.find((item) => item.beatId === beat.id)?.status ===
              "good",
          )
          .map((beat) => beat.id);

  return (
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

        <section className="stage" aria-label={`${mode} workspace`}>
          {mode === "ingest" && (
            <IngestStage
              projectName={project?.name ?? null}
              mediaName={projectMediaName(project)}
              state={mediaState}
              provider={transcription.label}
              cloud={transcription.cloud}
              hint={transcription.hint}
              onImport={() => {
                if (project !== null) {
                  openMediaPicker();
                }
              }}
              onRecord={openStudio}
              onTranscribe={() => void transcribeMedia()}
              onRetry={() => void transcribeMedia()}
              onTranscribeSeveral={() => {
                setBatchSelected([]);
                setBatchOpen(true);
              }}
            >
              {paneError?.pane === "ingest" && (
                <PaneAlert
                  message={paneError.copy.message}
                  detail={paneError.copy.detail}
                  onDismiss={() => setPaneError(null)}
                />
              )}

              {project === null && (
                <EmptyState
                  title="No Project Open"
                  body="Pick a project in the browser, or create one in the folder you are browsing."
                  action={{
                    label: "New Project",
                    onClick: () => void createProject("Untitled Project"),
                  }}
                />
              )}

              {project !== null && (
                <ScriptEditor
                  script={script}
                  words={scriptWords}
                  readTime={formatReadTime(readTimeSeconds(scriptWords))}
                  onScriptChange={(text) => {
                    setScript(text);
                    setPrompterOffset(0);
                    setPrompterPlaying(false);
                  }}
                  onUseTranscript={useTranscriptAsScript}
                  onOpenStudio={openStudio}
                />
              )}
            </IngestStage>
          )}

          {mode === "edit" && (
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
                  onDismiss={() => setPaneError(null)}
                />
              )}

              {project === null ? (
                <EmptyState
                  title="No Project Open"
                  body="Open a project in Ingest to edit its transcript."
                  action={{ label: "Go to Ingest", onClick: () => changeMode("ingest") }}
                />
              ) : !hasMedia ? (
                <EmptyState
                  title="No Media Yet"
                  body="Import a recording or file in Ingest, then transcribe it."
                  action={{ label: "Go to Ingest", onClick: () => changeMode("ingest") }}
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
                      onToggleCollapsed={() => setPlayerCollapsed((value) => !value)}
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
                            void transcribeMedia();
                          }
                        },
                      }}
                    />
                  ) : (
                  <div className="card" role="region" aria-label="Transcript editor">
                    <div className="card__head">
                      <h3>Transcript</h3>
                      <div className="toolbar">
                        <label className="search">
                          <span className="sr-only">Find in Transcript</span>
                          <input
                            autoComplete="off"
                            value={query}
                            onChange={(event) => {
                              setQuery(event.target.value);
                              setMatchCursor(0);
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
                      onDeleteSelection={deleteSelection}
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
                      <span className="toolbar__spacer" />
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={undoEdit}
                        disabled={!editing.canUndo}
                      >
                        Undo
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={redoEdit}
                        disabled={!editing.canRedo}
                      >
                        Redo
                      </button>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={saveTranscriptDocument}
                        disabled={project === null}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  )}
                </>
              )}
            </div>
          )}

          {mode === "deliver" && (
            <div className="stage__scroll">
              <header className="stage__head">
                <div>
                  <h2>Storyboard</h2>
                  <p className="stage__sub">Preview the cut, then export it.</p>
                </div>
                {!storyboardEmpty && (
                  <div className="toolbar">
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => preview("fast")}
                      disabled={project === null}
                    >
                      Fast Preview
                    </button>
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => preview("full")}
                      disabled={project === null}
                    >
                      Render Preview
                    </button>
                  </div>
                )}
              </header>

              {paneError?.pane === "deliver" && (
                <PaneAlert
                  message={paneError.copy.message}
                  detail={paneError.copy.detail}
                  onDismiss={() => setPaneError(null)}
                />
              )}

              {project === null ? (
                <EmptyState
                  title="No Project Open"
                  body="Open a project in Ingest to build its storyboard."
                  action={{ label: "Go to Ingest", onClick: () => changeMode("ingest") }}
                />
              ) : transcript === null ? (
                <EmptyState
                  title="No Transcript Yet"
                  body="Transcribe the take here to build a storyboard."
                  action={{
                    label: transcribing ? "Transcribing…" : "Transcribe",
                    onClick: () => {
                      if (!transcribing) {
                        void transcribeMedia();
                      }
                    },
                  }}
                />
              ) : plan === null ? (
                <EmptyState
                  title={storyboardEmpty ? "No Scenes Yet" : "No Preview Yet"}
                  body={
                    storyboardEmpty
                      ? "Build one scene per transcript segment, then preview the cut."
                      : "Render a preview to see the storyboard scenes."
                  }
                  action={
                    storyboardEmpty
                      ? { label: "Create Storyboard", onClick: () => void createStoryboard() }
                      : { label: "Render Preview", onClick: () => void preview("full") }
                  }
                />
              ) : (
                <div className="card card--flush">
                  <StoryboardPreview plan={plan} tier={tier} onTierChange={preview} />
                </div>
              )}

              <details className="disclosure">
                <summary>Advanced: Storyboard Document</summary>
                <p className="muted">Edit the storyboard JSON directly.</p>
                <textarea
                  className="editor"
                  aria-label="Storyboard JSON"
                  value={storyboardText}
                  onChange={(event) => setStoryboardText(event.target.value)}
                  spellCheck={false}
                />
                <div className="toolbar">
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={saveStoryboard}
                    disabled={project === null}
                  >
                    Save Storyboard
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={checkPrunableAssets}
                    disabled={project === null}
                  >
                    Check Prunable Assets
                  </button>
                  {prunable !== null && prunable.length > 0 && (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={deletePrunableAssets}
                    >
                      Delete {prunable.length} assets
                    </button>
                  )}
                </div>
              </details>

              <details className="disclosure">
                <summary>Generate Assets</summary>
                <div className="form-grid">
                  <fieldset className="fieldset">
                    <legend>Image</legend>
                    <label className="field">
                      Image Scene
                      <input
                        autoComplete="off"
                        value={imageSceneId}
                        onChange={(event) => setImageSceneId(event.target.value)}
                        placeholder="g1"
                      />
                    </label>
                    <label className="field">
                      Image Prompt
                      <input
                        autoComplete="off"
                        value={imagePrompt}
                        onChange={(event) => setImagePrompt(event.target.value)}
                        placeholder="A diagram of the pipeline…"
                      />
                    </label>
                    <div className="toolbar">
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={estimateImage}
                        disabled={project === null}
                      >
                        Estimate Image
                      </button>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={generateImage}
                        disabled={project === null || imageCost === null}
                      >
                        Generate Image
                      </button>
                    </div>
                    {imageCost !== null && (
                      <p className="muted">Cost per image: ${imageCost.toFixed(2)}</p>
                    )}
                  </fieldset>

                  <fieldset className="fieldset">
                    <legend>Video</legend>
                    <label className="field">
                      Video Scene
                      <input
                        autoComplete="off"
                        value={videoSceneId}
                        onChange={(event) => setVideoSceneId(event.target.value)}
                        placeholder="v1"
                      />
                    </label>
                    <label className="field">
                      Video Prompt
                      <input
                        autoComplete="off"
                        value={videoPrompt}
                        onChange={(event) => setVideoPrompt(event.target.value)}
                        placeholder="A rotating 3D diagram…"
                      />
                    </label>
                    <label className="field">
                      Clip Seconds
                      <input
                        autoComplete="off"
                        type="number"
                        min={1}
                        max={60}
                        value={videoSeconds}
                        onChange={(event) => setVideoSeconds(Number(event.target.value))}
                      />
                    </label>
                    <div className="toolbar">
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={estimateVideo}
                        disabled={project === null}
                      >
                        Estimate Video
                      </button>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={generateVideo}
                        disabled={project === null || videoCost === null}
                      >
                        Generate Video
                      </button>
                    </div>
                    {videoCost !== null && (
                      <p className="muted">Clip cost: ${videoCost.toFixed(2)}</p>
                    )}
                  </fieldset>
                </div>
              </details>

              <details className="disclosure">
                <summary>Review Feedback</summary>
                <textarea
                  className="editor"
                  aria-label="Patch JSON"
                  value={patchText}
                  onChange={(event) => setPatchText(event.target.value)}
                  placeholder='{"patches":[{"type":"remove","sceneId":"s1"}]}'
                  spellCheck={false}
                />
                <div className="toolbar">
                  <button type="button" className="button button--ghost" onClick={parsePatches}>
                    Parse Patches
                  </button>
                </div>
                {patches.length > 0 && (
                  <PatchReview
                    patches={patches}
                    accepted={accepted}
                    onToggle={(index) =>
                      setAccepted((current) =>
                        current.map((value, position) => (position === index ? !value : value)),
                      )
                    }
                    onApply={applyPatches}
                    onReject={() => {
                      setPatches([]);
                      setAccepted([]);
                    }}
                  />
                )}
              </details>
            </div>
          )}
        </section>

        {mode === "ingest" && (
          <IngestInspector
            probe={probe}
            probeError={probeError}
            probeLoading={probeLoading}
            hasMedia={hasMedia}
            hasTranscript={transcript !== null && liveWords > 0}
            transcribing={transcribing}
            onOpenInEdit={() => changeMode("edit")}
          />
        )}

        {mode === "edit" && (
          <aside className="inspector" aria-label="Inspector">
            <section className="inspector__section" aria-label="Cleanup">
              <h3>Cleanup</h3>
              {transcript === null ? (
                <p className="muted">Nothing to clean yet.</p>
              ) : (
                <>
                  {proposals.length === 0 ? (
                    <p className="muted">
                      No filler words, stutters, or repetitions found.
                    </p>
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
        )}

        {mode === "deliver" && (
          <aside className="inspector" aria-label="Inspector">
            <section
              id="export-panel"
              tabIndex={-1}
              className="inspector__section"
              aria-label="Export"
            >
              <h3>Export</h3>
              <label className="field">
                Output File
                <input
                  autoComplete="off"
                  title={outputPath}
                  value={outputPath}
                  onChange={(event) => setOutputPath(event.target.value)}
                  placeholder="/home/you/Verbal/demo/exports/final.mp4…"
                />
                {outputPath.trim() !== "" && (
                  <span className="field__hint" title={outputPath}>
                    {outputPath.split(/[\\/]/).filter(Boolean).slice(-1)[0]}
                  </span>
                )}
              </label>
              <label className="field">
                Preset
                <select
                  value={presetId}
                  onChange={(event) => {
                    const next = event.target.value as ExportPresetId;
                    setPresetId(next);

                    const preset = EXPORT_PRESETS.find((entry) => entry.id === next);
                    if (preset !== undefined && outputPath.trim() !== "") {
                      setOutputPath(withPresetExtension(outputPath, preset));
                    }
                  }}
                >
                  {EXPORT_PRESETS.filter((preset) => preset.id !== "podcast-audio").map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field--check">
                <input
                  type="checkbox"
                  checked={includeBrand}
                  onChange={(event) => setIncludeBrand(event.target.checked)}
                />
                Add Title And Outro Cards
              </label>
              {includeBrand && (
                <>
                  <label className="field">
                    Title
                    <input
                      autoComplete="off"
                      value={brand.title}
                      onChange={(event) => setBrand({ ...brand, title: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    Outro
                    <input
                      autoComplete="off"
                      value={brand.outro}
                      onChange={(event) => setBrand({ ...brand, outro: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    Contact
                    <input
                      autoComplete="off"
                      value={brand.contact}
                      onChange={(event) => setBrand({ ...brand, contact: event.target.value })}
                    />
                  </label>
                </>
              )}
              <ExportControls
                disabled={
                  project === null ||
                  storyboardEmpty ||
                  (includeBrand && brand.title.trim() === "")
                }
                reason={
                  storyboardEmpty
                    ? "Create a storyboard first."
                    : includeBrand && brand.title.trim() === ""
                      ? "Enter a title for the title card."
                      : null
                }
                job={job}
                onExport={exportStoryboard}
              />
            </section>
          </aside>
        )}
      </div>

      {studioOpen && (
        <StudioOverlay
          projectName={project?.name ?? null}
          script={script}
          words={scriptWords}
          readTime={formatReadTime(readTimeSeconds(scriptWords))}
          offsetWords={prompterOffset}
          wpm={prompterWpm}
          fontSize={prompterFontSize}
          mirror={prompterMirror}
          playing={prompterPlaying}
          reducedMotion={reducedMotion}
          videoRef={videoRef}
          capture={{
            state: takeState,
            countdown,
            elapsedSeconds,
            cameraAvailable,
            previewing,
            cameras,
            microphones,
            cameraId,
            microphoneId,
            takes,
            onStart: () => void startTake(),
            onStop: () => void stopTake(),
            onStartPreview: () => void startPreview(),
            onCameraChange: changeCamera,
            onMicrophoneChange: changeMicrophone,
          }}
          review={review}
          reviewing={reviewing}
          reviewLlm={{
            provider: llmReview?.provider ?? null,
            estimate: llmReview?.estimate ?? null,
            proposals: llmReview?.proposals ?? [],
            running: llmReview?.running ?? false,
            onPreview: () => {
              if (review !== null) {
                void previewEdits(review.takeId);
              }
            },
            onRun: () => {
              if (review !== null) {
                void runEdits(review.takeId);
              }
            },
            onToggle: toggleProposal,
            onApply: applyProposals,
            onDismiss: dismissProposals,
          }}
          dimmedBeatIds={dimmedBeatIds}
          cut={cut ?? undefined}
          onBuildCut={() => {
            if (review !== null) {
              void buildCut(review.takeId);
            }
          }}
          rendering={rendering}
          onRenderCut={() => {
            if (review !== null) {
              void renderCut(review.takeId);
            }
          }}
          error={paneError?.copy ?? null}
          onDismissError={() => setPaneError(null)}
          takeUrl={`/api/media/file?root=${encodeURIComponent(root)}`}
          onReview={(takeId) => void reviewTake(takeId)}
          onReread={rereadBeat}
          onStatusChange={overrideReviewStatus}
          onSeek={seekReview}
          onClose={closeStudio}
          onScriptChange={(text) => {
            setScript(text);
            setPrompterOffset(0);
            setPrompterPlaying(false);
          }}
          onUseTranscript={useTranscriptAsScript}
          onTogglePlay={() => setPrompterPlaying((value) => !value)}
          onWpmChange={(value) => setPrompterWpm(clampWpm(value))}
          onFontSizeChange={(value) => setPrompterFontSize(clampFontSize(value))}
          onToggleMirror={() => setPrompterMirror((value) => !value)}
          onReset={() => {
            setPrompterOffset(0);
            setPrompterPlaying(false);
          }}
        />
      )}

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

      <footer className="statusbar">
        <span className="statusbar__item">{jobStatusText(job) ?? "Ready"}</span>
        <span className="statusbar__item">{hasMedia ? "Media loaded" : "No media"}</span>
        <span
          className={`statusbar__message${error !== null ? " is-error" : ""}`}
          role="status"
          aria-live="polite"
          title={error?.detail}
        >
          {error?.message ?? message ?? ""}
        </span>
      </footer>
    </main>
  );
}
