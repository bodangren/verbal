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
import type { PreviewPlan, PreviewTier } from "@verbal/compose";
import { assessKeyQuality, type KeyQuality } from "@verbal/media/key-quality";
import { DEFAULT_PRESET_ID, EXPORT_PRESETS, type ExportPresetId } from "@verbal/media/presets";
import {
  DEFAULT_ACCEPTANCE,
  resolveAccepted,
  type Acceptance,
  type CleanupProposal,
} from "@verbal/cleanup";
import { CapturePanel } from "../components/CapturePanel";
import { MediaPicker } from "../components/MediaPicker";
import { CleanupReview } from "../components/CleanupReview";
import { PlaybackScreen } from "../components/PlaybackScreen";
import { ProjectBrowser } from "../components/ProjectBrowser";
import type { FsEntry } from "../server/fs-api";
import { PatchReview } from "../components/PatchReview";
import { StoryboardPreview } from "../components/StoryboardPreview";
import { TranscriptEditor, type WordSelection } from "../components/TranscriptEditor";
import { useAutoSave } from "../hooks/use-auto-save";
import { useTranscriptDocument } from "../hooks/use-transcript-document";

const GEOMETRY = { fps: 30, width: 1280, height: 720 };

/** Remembers the folder you were browsing, so launch lands on your work. */
const BROWSER_PATH_KEY = "verbal.browser.path";

/** The three workspaces. Panels are hidden, never unmounted, so state survives. */
const MODES = [
  { id: "ingest", label: "Ingest" },
  { id: "edit", label: "Edit" },
  { id: "deliver", label: "Deliver" },
] as const;

type WorkspaceMode = (typeof MODES)[number]["id"];

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

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      <p className="empty__body">{body}</p>
      {action !== undefined && (
        <button type="button" className="button button--primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
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
  const [batchRoots, setBatchRoots] = useState("");

  const [browserPath, setBrowserPath] = useState("");
  const [browserParent, setBrowserParent] = useState<string | null>(null);
  const [browserEntries, setBrowserEntries] = useState<FsEntry[]>([]);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [browserLoading, setBrowserLoading] = useState(false);
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
  const [importPath, setImportPath] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [presetId, setPresetId] = useState<ExportPresetId>(DEFAULT_PRESET_ID);
  const [prunable, setPrunable] = useState<string[] | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>("ingest");
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const [brand, setBrand] = useState({
    title: "Untitled",
    outro: "Thanks for watching",
    contact: "Daniel",
    loudness: -16,
  });
  const [job, setJob] = useState<JobRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [keyQuality, setKeyQuality] = useState<KeyQuality | null>(null);
  const [captureSeconds, setCaptureSeconds] = useState(10);
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

  async function guard(run: () => Promise<void>) {
    setError(null);
    try {
      await run();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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

    await loadTranscriptState(projectRoot);

    const storyboard = await request<StoryboardDocument>(
      `/api/storyboard?root=${encodeURIComponent(projectRoot)}`,
    );
    setStoryboardText(JSON.stringify(storyboard, null, 2));
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
      setMode(opened.media === undefined ? "ingest" : "edit");
      setBrowserError(null);
    });
  }

  function loadFolder(target?: string) {
    return guard(async () => {
      try {
        const listing = await request<{
          path: string;
          parent: string | null;
          entries: FsEntry[];
        }>(`/api/fs/list${target === undefined ? "" : `?path=${encodeURIComponent(target)}`}`);

        setBrowserPath(listing.path);
        setBrowserParent(listing.parent);
        setBrowserEntries(listing.entries);
        setBrowserError(null);

        // Remember where you were, so the next launch opens your work, not home.
        try {
          window.localStorage.setItem(BROWSER_PATH_KEY, listing.path);
        } catch {
          // Storage can be unavailable; browsing still works without it.
        }
      } catch (cause) {
        setBrowserError(cause instanceof Error ? cause.message : String(cause));
      }
    });
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

  function chooseMedia(filePath: string) {
    setImportPath(filePath);
    setPickerOpen(false);
  }

  // Leaving Ingest unmounts the camera element; stop the stream so the light
  // does not stay on behind an invisible preview.
  useEffect(() => {
    if (mode !== "ingest") {
      stopPreview();
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
      setMode("ingest");
      setMessage(`Created ${created.name}`);
      void loadFolder(browserPath);
    });
  }

  function importMedia() {
    return guard(async () => {
      const result = await postJson<{ project: ProjectDocument }>("/api/media/import", {
        projectRoot: root,
        sourcePath: importPath,
        mode: "copy",
      });
      setProject(result.project);
      setMessage("Media imported");
      setMode("edit");
    });
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
    onError: setError,
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
    });
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
      const started = await postJson<JobRecord>("/api/transcribe", { projectRoot: root });
      setJob(started);

      const finished = await pollJob(started.id);
      if (finished.status !== "done") {
        throw new Error(finished.error ?? `transcription ${finished.status}`);
      }

      await loadTranscriptState();

      const result = finished.result as { words?: number } | null;
      setMessage(
        result?.words === undefined
          ? "Transcription finished"
          : `Transcribed ${result.words} words`,
      );
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
      const roots = batchRoots
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");

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
    });
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
      setError(cause instanceof Error ? cause.message : String(cause));
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

  function sampleKey() {
    const video = videoRef.current;
    if (video === null) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 36;
    const context = canvas.getContext("2d");
    if (context === null) {
      return;
    }

    try {
      context.drawImage(video, 0, 0, 64, 36);
      const { data } = context.getImageData(0, 0, 64, 36);
      const samples = [];

      for (let index = 0; index < data.length; index += 32) {
        samples.push({
          r: data[index] ?? 0,
          g: data[index + 1] ?? 0,
          b: data[index + 2] ?? 0,
        });
      }

      setKeyQuality(assessKeyQuality(samples));
    } catch {
      // The frame is not drawable yet; the next tick will try again.
    }
  }

  useEffect(() => {
    if (!previewing) {
      return;
    }

    const handle = setInterval(() => sampleKey(), 1000);
    return () => clearInterval(handle);
  }, [previewing]);

  function startPreview() {
    return guard(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;

      if (videoRef.current !== null) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setPreviewing(true);
    });
  }

  function stopPreview() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setPreviewing(false);
  }

  function record() {
    return guard(async () => {
      const started = await postJson<JobRecord>("/api/capture", {
        projectRoot: root,
        durationSeconds: captureSeconds,
      });
      setJob(started);
      await pollJob(started.id);
      stopPreview();

      try {
        setProject(await request<ProjectDocument>(`/api/projects?root=${encodeURIComponent(root)}`));
      } catch {
        // The project update is best-effort; the job result is authoritative.
      }
      setMode("edit");
    });
  }

  function stopRecording() {
    return guard(async () => {
      if (job !== null && (job.status === "queued" || job.status === "running")) {
        await request<JobRecord>(`/api/jobs/${job.id}`, { method: "DELETE" });
        await pollJob(job.id);
      }
      stopPreview();
    });
  }

  function exportStoryboard() {
    return guard(async () => {
      const record = await postJson<JobRecord>("/api/storyboard/export", {
        root,
        outputPath,
        preset: presetId,
        brand: {
          title: { text: brand.title },
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

  const captureRunning =
    job !== null &&
    job.kind === "capture" &&
    (job.status === "queued" || job.status === "running");

  const saveState =
    transcript === null
      ? "No transcript"
      : autoSave.saving
        ? "Saving…"
        : editing.dirty
          ? "Unsaved changes"
          : "Saved";

  const hasMedia = project?.media !== undefined;
  const liveWords =
    transcript === null ? 0 : transcript.words.length - transcript.removedWordIds.length;

  return (
    <main className="app" data-mode={mode}>
      <header className="bar">
        <div className="bar__brand">
          <span className="bar__mark" aria-hidden="true">
            V
          </span>
          <span className="bar__wordmark">Verbal</span>
        </div>

        <div className="bar__document">
          {project === null ? (
            <span className="bar__document-empty">No project open</span>
          ) : (
            <>
              <span className="bar__document-name">{project.name}</span>
              <span className="bar__document-path" title={root}>
                {root}
              </span>
            </>
          )}
        </div>

        <nav className="segmented" aria-label="Workspace mode">
          {MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="segmented__option"
              aria-pressed={mode === entry.id}
              onClick={() => setMode(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <p className="bar__save" role="status" aria-live="polite">
          {saveState}
        </p>
      </header>

      <div className="workspace">
        {mode === "ingest" && (
          <aside className="sidebar" aria-label="Project browser">
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
            />
          </aside>
        )}

        <section className="stage" aria-label={`${mode} workspace`}>
          {mode === "ingest" && (
            <div className="stage__scroll">
              <header className="stage__head">
                <div>
                  <h2>Capture</h2>
                  <p className="stage__sub">
                    {project === null
                      ? "Open or create a project to record a take."
                      : `Record a take into ${project.name}.`}
                  </p>
                </div>
                <span className="pill">{hasMedia ? "Media loaded" : "No media"}</span>
              </header>

              {project === null ? (
                <EmptyState
                  title="No project open"
                  body="Pick a project in the browser, or create one in the folder you are browsing."
                />
              ) : (
                <div className="card">
                  <div className="capture__frame">
                    <video
                      ref={videoRef}
                      className="capture__video"
                      muted
                      playsInline
                      aria-label="Camera preview"
                    />
                    {!previewing && (
                      <div className="capture__placeholder">
                        <span className="capture__placeholder-mark" aria-hidden="true">
                          ◉
                        </span>
                        <span>Camera preview is off</span>
                      </div>
                    )}
                  </div>
                  <CapturePanel
                    cameraAvailable={cameraAvailable}
                    keyQuality={keyQuality}
                    previewing={previewing}
                    recording={captureRunning}
                    durationSeconds={captureSeconds}
                    onStartPreview={startPreview}
                    onStopPreview={stopPreview}
                    onDurationChange={setCaptureSeconds}
                    onRecord={record}
                    onStop={stopRecording}
                  />
                </div>
              )}
            </div>
          )}

          {mode === "edit" && (
            <div className="stage__scroll">
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

              {project === null ? (
                <EmptyState
                  title="No project open"
                  body="Open a project in Ingest to edit its transcript."
                  action={{ label: "Go to Ingest", onClick: () => setMode("ingest") }}
                />
              ) : !hasMedia ? (
                <EmptyState
                  title="No media yet"
                  body="Import a recording or file in Ingest, then transcribe it."
                  action={{ label: "Go to Ingest", onClick: () => setMode("ingest") }}
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
                    />
                  </div>

                  {transcript === null ? (
                    <EmptyState
                      title="No transcript yet"
                      body="Play and scrub the take now. Transcribe it in Ingest to edit the words."
                      action={{ label: "Go to Ingest", onClick: () => setMode("ingest") }}
                    />
                  ) : (
                  <div className="card" role="region" aria-label="Transcript editor">
                    <div className="card__head">
                      <h3>Transcript</h3>
                      <div className="toolbar">
                        <label className="search">
                          <span className="sr-only">Find in transcript</span>
                          <input
                            autoComplete="off"
                            value={query}
                            onChange={(event) => {
                              setQuery(event.target.value);
                              setMatchCursor(0);
                            }}
                            placeholder="Find in transcript"
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
                        Insert silence
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
                        Move back
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => moveSelection(1)}
                        disabled={selection === null}
                      >
                        Move forward
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
                      Fast preview
                    </button>
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => preview("full")}
                      disabled={project === null}
                    >
                      Render preview
                    </button>
                  </div>
                )}
              </header>

              {project === null ? (
                <EmptyState
                  title="No project open"
                  body="Open a project in Ingest to build its storyboard."
                  action={{ label: "Go to Ingest", onClick: () => setMode("ingest") }}
                />
              ) : transcript === null ? (
                <EmptyState
                  title="No transcript yet"
                  body="Transcribe the take in Ingest to build a storyboard."
                  action={{ label: "Go to Ingest", onClick: () => setMode("ingest") }}
                />
              ) : plan === null ? (
                <EmptyState
                  title={storyboardEmpty ? "No scenes yet" : "No preview yet"}
                  body={
                    storyboardEmpty
                      ? "Build one scene per transcript segment, then preview the cut."
                      : "Render a preview to see the storyboard scenes."
                  }
                  action={
                    storyboardEmpty
                      ? { label: "Create storyboard", onClick: () => void createStoryboard() }
                      : { label: "Render preview", onClick: () => void preview("full") }
                  }
                />
              ) : (
                <div className="card card--flush">
                  <StoryboardPreview plan={plan} tier={tier} onTierChange={preview} />
                </div>
              )}

              <details className="disclosure">
                <summary>Advanced: storyboard document</summary>
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
                    Save storyboard
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={checkPrunableAssets}
                    disabled={project === null}
                  >
                    Check prunable assets
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
                <summary>Generate assets</summary>
                <div className="form-grid">
                  <fieldset className="fieldset">
                    <legend>Image</legend>
                    <label className="field">
                      Image scene
                      <input
                        autoComplete="off"
                        value={imageSceneId}
                        onChange={(event) => setImageSceneId(event.target.value)}
                        placeholder="g1"
                      />
                    </label>
                    <label className="field">
                      Image prompt
                      <input
                        autoComplete="off"
                        value={imagePrompt}
                        onChange={(event) => setImagePrompt(event.target.value)}
                        placeholder="A diagram of the pipeline"
                      />
                    </label>
                    <div className="toolbar">
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={estimateImage}
                        disabled={project === null}
                      >
                        Estimate image
                      </button>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={generateImage}
                        disabled={project === null || imageCost === null}
                      >
                        Generate image
                      </button>
                    </div>
                    {imageCost !== null && (
                      <p className="muted">Cost per image: ${imageCost.toFixed(2)}</p>
                    )}
                  </fieldset>

                  <fieldset className="fieldset">
                    <legend>Video</legend>
                    <label className="field">
                      Video scene
                      <input
                        autoComplete="off"
                        value={videoSceneId}
                        onChange={(event) => setVideoSceneId(event.target.value)}
                        placeholder="v1"
                      />
                    </label>
                    <label className="field">
                      Video prompt
                      <input
                        autoComplete="off"
                        value={videoPrompt}
                        onChange={(event) => setVideoPrompt(event.target.value)}
                        placeholder="A rotating 3D diagram"
                      />
                    </label>
                    <label className="field">
                      Clip seconds
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
                        Estimate video
                      </button>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={generateVideo}
                        disabled={project === null || videoCost === null}
                      >
                        Generate video
                      </button>
                    </div>
                    {videoCost !== null && (
                      <p className="muted">Clip cost: ${videoCost.toFixed(2)}</p>
                    )}
                  </fieldset>
                </div>
              </details>

              <details className="disclosure">
                <summary>Review feedback</summary>
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
                    Parse patches
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
          <aside className="inspector" aria-label="Inspector">
            <section className="inspector__section" aria-label="Source media">
              <h3>Source media</h3>
              <p className="muted">Import a recording or an existing file into this project.</p>
              <label className="field">
                Source file path
                <input
                  autoComplete="off"
                  value={importPath}
                  onChange={(event) => setImportPath(event.target.value)}
                  placeholder="/home/you/Videos/take.mp4"
                  disabled={project === null}
                />
              </label>
              <div className="toolbar">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={openMediaPicker}
                  disabled={project === null}
                >
                  Browse…
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={importMedia}
                  disabled={project === null || importPath.trim() === ""}
                >
                  Import copy
                </button>
              </div>
            </section>

            <section className="inspector__section" aria-label="Transcription">
              <h3>Transcription</h3>
              <p className="muted">Transcribing replaces this project&apos;s stored transcript.</p>
              <button
                type="button"
                className="button button--primary"
                onClick={transcribeMedia}
                disabled={project === null || !hasMedia || transcribing}
              >
                {transcribing ? "Transcribing…" : "Transcribe media"}
              </button>
              {transcribing && job !== null && (
                <p className="muted" role="status">
                  Transcribing {Math.round(job.progress * 100)}%
                </p>
              )}

              <details className="disclosure disclosure--inline">
                <summary>Batch projects</summary>
                <label className="field">
                  One project root per line
                  <textarea
                    className="editor editor--short"
                    value={batchRoots}
                    onChange={(event) => setBatchRoots(event.target.value)}
                    spellCheck={false}
                  />
                </label>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={startBatch}
                  disabled={batchRoots.trim() === "" || transcribing}
                >
                  Start batch
                </button>
                {batchOutcomes.length > 0 && (
                  <ul className="outcomes" aria-label="Batch outcomes">
                    {batchOutcomes.map((outcome) => (
                      <li key={outcome.root} data-status={outcome.status}>
                        <span>{outcome.root}</span>
                        <span className="muted">{outcome.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </section>
          </aside>
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
                        Remove accepted
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
            <section className="inspector__section" aria-label="Export">
              <h3>Export</h3>
              <label className="field">
                Output file
                <input
                  autoComplete="off"
                  value={outputPath}
                  onChange={(event) => setOutputPath(event.target.value)}
                  placeholder="/home/you/Verbal/demo/exports/final.mp4"
                />
              </label>
              <label className="field">
                Preset
                <select
                  value={presetId}
                  onChange={(event) => setPresetId(event.target.value as ExportPresetId)}
                >
                  {EXPORT_PRESETS.filter((preset) => preset.id !== "podcast-audio").map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
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
              <button
                type="button"
                className="button button--primary"
                onClick={exportStoryboard}
                disabled={project === null}
              >
                Export storyboard
              </button>
              {job !== null && (
                <p className="muted">
                  Job {job.status} · {Math.round(job.progress * 100)}%
                  {job.error !== null ? ` · ${job.error}` : ""}
                </p>
              )}
            </section>
          </aside>
        )}
      </div>

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

      <footer className="statusbar">
        <span className="statusbar__item">
          {job !== null && (job.status === "queued" || job.status === "running")
            ? `${job.kind}: ${Math.round(job.progress * 100)}%`
            : "Ready"}
        </span>
        <span className="statusbar__item">{hasMedia ? "Media loaded" : "No media"}</span>
        <span
          className={`statusbar__message${error !== null ? " is-error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {error ?? message ?? ""}
        </span>
      </footer>
    </main>
  );
}
