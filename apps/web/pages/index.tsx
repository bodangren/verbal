import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { searchTranscript, type JobRecord, type ProjectDocument, type TranscriptDocument } from "@verbal/core";
import {
  applyAcceptedPatches,
  parsePatchResponse,
  parseStoryboard,
  type StoryboardDocument,
  type StoryboardPatch,
} from "@verbal/storyboard";
import type { PreviewPlan, PreviewTier } from "@verbal/compose";
import { assessKeyQuality, type KeyQuality } from "@verbal/media/key-quality";
import {
  DEFAULT_ACCEPTANCE,
  resolveAccepted,
  type Acceptance,
  type CleanupProposal,
} from "@verbal/cleanup";
import { CapturePanel } from "../components/CapturePanel";
import { CleanupReview } from "../components/CleanupReview";
import { PlaybackScreen } from "../components/PlaybackScreen";
import { PatchReview } from "../components/PatchReview";
import { StoryboardPreview } from "../components/StoryboardPreview";
import { TranscriptEditor, type WordSelection } from "../components/TranscriptEditor";
import { useAutoSave } from "../hooks/use-auto-save";
import { useTranscriptDocument } from "../hooks/use-transcript-document";

const GEOMETRY = { fps: 30, width: 1280, height: 720 };

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

export default function Home() {
  const [root, setRoot] = useState("");
  const [name, setName] = useState("Untitled");
  const [project, setProject] = useState<ProjectDocument | null>(null);
  const editing = useTranscriptDocument(null);
  const { undo: undoEdit, redo: redoEdit } = editing;
  const transcript = editing.document;
  const [selection, setSelection] = useState<WordSelection | null>(null);
  const [proposals, setProposals] = useState<CleanupProposal[]>([]);
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
  async function loadTranscriptState() {
    try {
      editing.reset(
        await request<TranscriptDocument>(`/api/transcript?root=${encodeURIComponent(root)}`),
      );
    } catch {
      editing.reset(null);
    }
    setSelection(null);

    try {
      const cleanup = await request<{ proposals: CleanupProposal[] }>(
        `/api/cleanup?root=${encodeURIComponent(root)}`,
      );
      setProposals(cleanup.proposals);
    } catch {
      setProposals([]);
    }
    setAcceptance(DEFAULT_ACCEPTANCE);
  }

  async function loadProjectFiles(next: ProjectDocument) {
    setProject(next);

    await loadTranscriptState();

    const storyboard = await request<StoryboardDocument>(
      `/api/storyboard?root=${encodeURIComponent(root)}`,
    );
    setStoryboardText(JSON.stringify(storyboard, null, 2));
    setMessage(`Opened ${next.name}`);
  }

  function openProject() {
    return guard(async () => {
      const opened = await request<ProjectDocument>(`/api/projects?root=${encodeURIComponent(root)}`);
      await loadProjectFiles(opened);
    });
  }

  function createProject() {
    return guard(async () => {
      const created = await postJson<ProjectDocument>("/api/projects", { root, name });
      await loadProjectFiles(created);
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
      await pollJob(record.id);
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

  return (
    <main className="app">
      <header className="app__header">
        <h1>Verbal</h1>
        <p className="subtitle">Storyboard studio</p>
      </header>

      {error !== null && <p className="status status--error">{error}</p>}
      {message !== null && <p className="status">{message}</p>}

      <section className="panel" aria-label="Project">
        <h2>Project</h2>
        <label className="field">
          Folder
          <input
            value={root}
            onChange={(event) => setRoot(event.target.value)}
            placeholder="/home/you/Verbal/demo"
          />
        </label>
        <label className="field">
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="row">
          <button type="button" onClick={createProject}>
            Create
          </button>
          <button type="button" onClick={openProject}>
            Open
          </button>
        </div>
        {project !== null && (
          <p className="muted">
            {project.name} · media:{" "}
            {project.media?.assetPath ?? project.media?.externalPath ?? "none"}
          </p>
        )}
      </section>

      <section className="panel" aria-label="Capture">
        <h2>Green-screen capture</h2>
        <video
          ref={videoRef}
          className="capture__preview"
          muted
          playsInline
          aria-label="Camera preview"
        />
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
      </section>

      <section className="panel" aria-label="Media">
        <h2>Media</h2>
        <label className="field">
          Source file
          <input
            value={importPath}
            onChange={(event) => setImportPath(event.target.value)}
            placeholder="/media/take.mp4"
          />
        </label>
        <button type="button" onClick={importMedia} disabled={project === null}>
          Import copy
        </button>
      </section>

      <section className="panel" aria-label="Transcription">
        <h2>Transcription</h2>
        <p className="muted">Transcribing replaces this project&apos;s stored transcript.</p>
        <div className="row">
          <button
            type="button"
            onClick={transcribeMedia}
            disabled={project === null || project.media === undefined || transcribing}
          >
            Transcribe media
          </button>
        </div>
        {transcribing && job !== null && (
          <p className="muted">
            {job.status === "queued" ? "Queued" : `Transcribing ${Math.round(job.progress * 100)}%`}
          </p>
        )}
      </section>

      {transcript !== null && project?.media !== undefined && (
        <section className="panel" aria-label="Playback">
          <h2>Playback</h2>
          <PlaybackScreen
            transcript={transcript}
            mediaUrl={`/api/media/file?root=${encodeURIComponent(root)}`}
            transcriptLabel="Playback transcript"
          />
        </section>
      )}

      {transcript !== null && (
        <section className="panel" aria-label="Cleanup">
          <h2>Cleanup</h2>
          {proposals.length === 0 ? (
            <p className="muted">No filler words, stutters, or repetitions found.</p>
          ) : (
            <>
              <p className="muted">
                {acceptedProposals.length} of {proposals.length} proposals accepted
              </p>
              <div className="row">
                <button
                  type="button"
                  onClick={removeAcceptedProposals}
                  disabled={acceptedProposals.length === 0}
                >
                  Remove accepted
                </button>
              </div>
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
        </section>
      )}

      {transcript !== null && (
        <section className="panel" aria-label="Transcript editor">
          <h2>Transcript</h2>
          <div className="row">
            <label className="field">
              Find
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setMatchCursor(0);
                }}
                placeholder="Search the transcript"
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
                  onClick={() => stepMatch(-1)}
                  disabled={matches.length === 0}
                >
                  Previous match
                </button>
                <button
                  type="button"
                  onClick={() => stepMatch(1)}
                  disabled={matches.length === 0}
                >
                  Next match
                </button>
              </>
            )}
          </div>
          <div className="row">
            <label className="field">
              Silence (seconds)
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={silenceSeconds}
                onChange={(event) => setSilenceSeconds(Number(event.target.value))}
              />
            </label>
            <button
              type="button"
              onClick={insertSilenceAtSelection}
              disabled={selection === null}
            >
              Insert silence
            </button>
            <button type="button" onClick={splitAtSelection} disabled={selection === null}>
              Split segment
            </button>
          </div>
          <div className="row">
            <button type="button" onClick={deleteSelection} disabled={selection === null}>
              Delete selection
            </button>
            <button type="button" onClick={undoEdit} disabled={!editing.canUndo}>
              Undo
            </button>
            <button type="button" onClick={redoEdit} disabled={!editing.canRedo}>
              Redo
            </button>
            <button
              type="button"
              onClick={saveTranscriptDocument}
              disabled={project === null}
            >
              Save transcript
            </button>
            <span className="muted" role="status">
              {autoSave.saving ? "Saving…" : editing.dirty ? "Unsaved changes" : "Saved"}
            </span>
          </div>
          <TranscriptEditor
            transcript={transcript}
            selectedRange={selection}
            matchedRanges={matches}
            onWordClick={(_wordId, index) => setSelection({ fromIndex: index, toIndex: index })}
            onSelectionChange={setSelection}
            onDeleteSelection={deleteSelection}
          />
        </section>
      )}

      <section className="panel" aria-label="Storyboard">
        <h2>Storyboard</h2>
        {transcript === null && <p className="muted">Open a project with a transcript first.</p>}
        <textarea
          className="editor"
          aria-label="Storyboard JSON"
          value={storyboardText}
          onChange={(event) => setStoryboardText(event.target.value)}
          spellCheck={false}
        />
        <div className="row">
          <button type="button" onClick={saveStoryboard} disabled={project === null}>
            Save
          </button>
          <button type="button" onClick={() => preview("fast")} disabled={project === null}>
            Fast preview
          </button>
          <button type="button" onClick={() => preview("full")} disabled={project === null}>
            Full preview
          </button>
        </div>

        <div className="row">
          <label className="field">
            Image scene
            <input
              value={imageSceneId}
              onChange={(event) => setImageSceneId(event.target.value)}
              placeholder="g1"
            />
          </label>
          <label className="field">
            Image prompt
            <input
              value={imagePrompt}
              onChange={(event) => setImagePrompt(event.target.value)}
              placeholder="A diagram of the pipeline"
            />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={estimateImage} disabled={project === null}>
            Estimate image
          </button>
          <button
            type="button"
            onClick={generateImage}
            disabled={project === null || imageCost === null}
          >
            Generate image
          </button>
        </div>
        {imageCost !== null && (
          <p className="muted">Cost per image: ${imageCost.toFixed(2)}</p>
        )}

        <div className="row">
          <label className="field">
            Video scene
            <input
              value={videoSceneId}
              onChange={(event) => setVideoSceneId(event.target.value)}
              placeholder="v1"
            />
          </label>
          <label className="field">
            Video prompt
            <input
              value={videoPrompt}
              onChange={(event) => setVideoPrompt(event.target.value)}
              placeholder="A rotating 3D diagram"
            />
          </label>
          <label className="field">
            Clip seconds
            <input
              type="number"
              min={1}
              max={60}
              value={videoSeconds}
              onChange={(event) => setVideoSeconds(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={estimateVideo} disabled={project === null}>
            Estimate video
          </button>
          <button
            type="button"
            onClick={generateVideo}
            disabled={project === null || videoCost === null}
          >
            Generate video
          </button>
        </div>
        {videoCost !== null && (
          <p className="muted">Clip cost: ${videoCost.toFixed(2)}</p>
        )}

        {plan !== null && (
          <StoryboardPreview plan={plan} tier={tier} onTierChange={preview} />
        )}
      </section>

      <section className="panel" aria-label="Feedback">
        <h2>Feedback</h2>
        <textarea
          className="editor"
          aria-label="Patch JSON"
          value={patchText}
          onChange={(event) => setPatchText(event.target.value)}
          placeholder='{"patches":[{"type":"remove","sceneId":"s1"}]}'
          spellCheck={false}
        />
        <div className="row">
          <button type="button" onClick={parsePatches}>
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
      </section>

      <section className="panel" aria-label="Export">
        <h2>Export</h2>
        <label className="field">
          Output file
          <input
            value={outputPath}
            onChange={(event) => setOutputPath(event.target.value)}
            placeholder="/home/you/Verbal/demo/exports/final.mp4"
          />
        </label>
        <label className="field">
          Title
          <input
            value={brand.title}
            onChange={(event) => setBrand({ ...brand, title: event.target.value })}
          />
        </label>
        <label className="field">
          Outro
          <input
            value={brand.outro}
            onChange={(event) => setBrand({ ...brand, outro: event.target.value })}
          />
        </label>
        <label className="field">
          Contact
          <input
            value={brand.contact}
            onChange={(event) => setBrand({ ...brand, contact: event.target.value })}
          />
        </label>
        <button type="button" onClick={exportStoryboard} disabled={project === null}>
          Export storyboard
        </button>
        {job !== null && (
          <p className="muted">
            Job {job.status} · {Math.round(job.progress * 100)}%
            {job.error !== null ? ` · ${job.error}` : ""}
          </p>
        )}
      </section>
    </main>
  );
}
