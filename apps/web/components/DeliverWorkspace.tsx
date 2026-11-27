import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectDocument, TranscriptDocument } from "@verbal/core/browser";
import type { PreviewPlan, PreviewTier } from "@verbal/compose";
import {
  applyAcceptedPatches,
  parsePatchResponse,
  parseStoryboard,
  storyboardFromTranscript,
  type StoryboardPatch,
} from "@verbal/storyboard";
import {
  DEFAULT_PRESET_ID,
  EXPORT_PRESETS,
  withPresetExtension,
  type ExportPresetId,
} from "@verbal/media/presets";
import type { PaneId } from "../hooks/use-studio";
import { errorCopyFor, type ErrorCopy } from "../lib/error-copy";
import {
  checkPrunableAssets as checkPrunableAssetsApi,
  deletePrunableAssets as deletePrunableAssetsApi,
  estimateImage as estimateImageApi,
  estimateVideo as estimateVideoApi,
  exportStoryboard as exportStoryboardApi,
  generateImage as generateImageApi,
  generateVideo as generateVideoApi,
  getStoryboard,
  previewStoryboard,
  saveStoryboard as saveStoryboardApi,
} from "../lib/api-client";
import { useJob, useJobActions } from "../hooks/use-job";
import { StoryboardPreview } from "./StoryboardPreview";
import { ExportControls } from "./ExportControls";
import { PatchReview } from "./PatchReview";
import { EmptyState } from "./EmptyState";
import { PaneAlert } from "./PaneAlert";

const GEOMETRY = { fps: 30, width: 1280, height: 720 };

/** A sensible export destination inside the project, so a path is never typed. */
function defaultOutputPath(
  projectRoot: string,
  projectName: string,
  presetId: ExportPresetId,
): string {
  const extension = EXPORT_PRESETS.find((preset) => preset.id === presetId)?.extension ?? "mp4";
  const name = projectName.trim().replace(/[\\/]+/g, "-") || "export";
  return `${projectRoot.replace(/\/+$/, "")}/exports/${name}.${extension}`;
}

export type DeliverWorkspaceProps = {
  /** True only while Export is the active mode; hides the pane, not the state. */
  active: boolean;
  root: string;
  project: ProjectDocument | null;
  transcript: TranscriptDocument | null;
  paneError: { pane: PaneId; copy: ErrorCopy } | null;
  onDismissPaneError: () => void;
  guard: (run: () => Promise<void>, pane?: PaneId) => Promise<void>;
  setMessage: (message: string | null) => void;
  setError: (error: ErrorCopy | null) => void;
  onGoToIngest: () => void;
  onTranscribe: () => void;
};

/**
 * The Export workspace: the storyboard preview, the advanced editors, and the
 * export panel. It owns every piece of storyboard and export state, so the
 * page only keeps project and session state.
 */
export function DeliverWorkspace({
  active,
  root,
  project,
  transcript,
  paneError,
  onDismissPaneError,
  guard,
  setMessage,
  setError,
  onGoToIngest,
  onTranscribe,
}: DeliverWorkspaceProps) {
  const { job } = useJob();
  const { setJob, pollJob } = useJobActions();
  const [storyboardText, setStoryboardText] = useState("");
  const [tier, setTier] = useState<PreviewTier>("fast");
  const [plan, setPlan] = useState<PreviewPlan | null>(null);
  const [patchText, setPatchText] = useState("");
  const [patches, setPatches] = useState<StoryboardPatch[]>([]);
  const [accepted, setAccepted] = useState<boolean[]>([]);
  const [outputPath, setOutputPath] = useState("");
  const [presetId, setPresetId] = useState<ExportPresetId>(DEFAULT_PRESET_ID);
  const [prunable, setPrunable] = useState<string[] | null>(null);
  const [brand, setBrand] = useState({
    title: "",
    outro: "",
    contact: "",
    loudness: -16,
  });
  const [includeBrand, setIncludeBrand] = useState(true);
  const [imageSceneId, setImageSceneId] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageCost, setImageCost] = useState<number | null>(null);
  const [videoSceneId, setVideoSceneId] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoSeconds, setVideoSeconds] = useState(4);
  const [videoCost, setVideoCost] = useState<number | null>(null);
  const [requestError, setRequestError] = useState<ErrorCopy | null>(null);
  const brandTitleProjectRef = useRef<string | null>(null);
  const outputPathRootRef = useRef<string | null>(null);

  // Load the storyboard for the open project, and restore the fast preview so
  // Deliver is not empty after a reload. The fast tier never starts a render.
  useEffect(() => {
    if (root === "") {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const storyboard = await getStoryboard(root);
        if (cancelled) {
          return;
        }
        setStoryboardText(JSON.stringify(storyboard, null, 2));
        setPlan(null);
        if (storyboard.scenes.length > 0) {
          setTier("fast");
          try {
            setPlan(
              await previewStoryboard({
                root,
                tier: "fast",
                version: 1,
                geometry: GEOMETRY,
              }),
            );
          } catch {
            // The Render Preview button stays as the way to try again.
          }
        }
      } catch {
        // The storyboard is optional; Deliver shows its empty state.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [root]);

  // A new project resets the title card to the project name, keeping the other
  // card fields. Reopening the same project keeps any edited title.
  useEffect(() => {
    if (project === null) {
      return;
    }
    if (brandTitleProjectRef.current !== root) {
      brandTitleProjectRef.current = root;
      setBrand((current) => ({ ...current, title: project.name }));
    }
  }, [root, project]);

  // A new project resets the export destination to its default path. A preset
  // change swaps the extension instead, so the typed path is kept.
  useEffect(() => {
    if (project === null || root === "") {
      outputPathRootRef.current = null;
      return;
    }
    if (outputPathRootRef.current === root) {
      return;
    }
    outputPathRootRef.current = root;
    setOutputPath(defaultOutputPath(root, project.name, presetId));
  }, [root, project, presetId]);

  const exportJob = job !== null && job.kind === "export" ? job : null;
  const exportRunning =
    exportJob !== null && (exportJob.status === "queued" || exportJob.status === "running");
  const transcribing =
    job !== null &&
    job.kind === "transcribe" &&
    (job.status === "queued" || job.status === "running");

  /** A parsed, empty storyboard is the first-run Deliver state. */
  const storyboardEmpty = useMemo(() => {
    try {
      return parseStoryboard(storyboardText).scenes.length === 0;
    } catch {
      return false;
    }
  }, [storyboardText]);

  function preview(nextTier: PreviewTier) {
    return guard(async () => {
      setTier(nextTier);
      const next = await previewStoryboard({
        root,
        tier: nextTier,
        version: (plan?.version ?? 0) + 1,
        geometry: GEOMETRY,
      });
      setPlan(next);
    });
  }

  /** Builds the first storyboard from the transcript, then previews it. */
  function createStoryboard() {
    return guard(async () => {
      if (transcript === null) {
        return;
      }

      const document = storyboardFromTranscript(transcript);
      const saved = await saveStoryboardApi(root, document);
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
      const saved = await saveStoryboardApi(root, document);
      setStoryboardText(JSON.stringify(saved, null, 2));
      setMessage("Storyboard saved");
    });
  }

  function checkPrunableAssets() {
    return guard(async () => {
      const result = await checkPrunableAssetsApi(root);
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
      const result = await deletePrunableAssetsApi(root);
      setPrunable(null);
      setMessage(`Deleted ${result.deleted.length} generated assets`);
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
      const saved = await saveStoryboardApi(root, next);
      setStoryboardText(JSON.stringify(saved, null, 2));
      setPatches([]);
      setAccepted([]);
      setMessage("Patches applied");
    });
  }

  function exportStoryboard() {
    return guard(async () => {
      setRequestError(null);
      setMessage(null);
      const record = await exportStoryboardApi({
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
      }).catch((cause: unknown) => {
        setRequestError(errorCopyFor(cause));
        setMessage("Export failed");
        return null;
      });
      if (record === null) {
        return;
      }
      setJob(record);
      const finished = await pollJob(record.id);
      const result = finished.result as { outputPath?: string } | null;
      if (result?.outputPath !== undefined) {
        setOutputPath(result.outputPath);
      }
    });
  }

  function estimateImage() {
    return guard(async () => {
      const result = await estimateImageApi(root, imageSceneId, imagePrompt);
      setImageCost(result.estimate);
      setMessage(`Estimated cost: $${result.estimate.toFixed(2)} (${result.provider})`);
    });
  }

  function generateImage() {
    return guard(async () => {
      const result = await generateImageApi(root, imageSceneId, imagePrompt);
      setStoryboardText(JSON.stringify(result.document, null, 2));
      setImageCost(result.cost);
      setMessage(
        `Generated image ${result.assetId.slice(0, 8)} for $${result.cost.toFixed(2)}`,
      );
    });
  }

  function estimateVideo() {
    return guard(async () => {
      const result = await estimateVideoApi(root, videoSceneId, videoPrompt, videoSeconds);
      setVideoCost(result.estimate);
      setMessage(`Estimated clip cost: $${result.estimate.toFixed(2)} (${result.provider})`);
    });
  }

  function generateVideo() {
    return guard(async () => {
      const record = await generateVideoApi(root, videoSceneId, videoPrompt, videoSeconds);
      setJob(record);
      await pollJob(record.id);

      const storyboard = await getStoryboard(root);
      setStoryboardText(JSON.stringify(storyboard, null, 2));
      setMessage("Clip generated");
    });
  }

  if (!active) {
    return null;
  }

  return (
    <>
      <section className="stage" aria-label="deliver workspace">
        <div className="stage__scroll">
          <header className="stage__head">
            <div>
              <h2>Export</h2>
              <p className="stage__sub">Preview the cut, then export it.</p>
            </div>
          </header>

          {paneError?.pane === "deliver" && (
            <PaneAlert
              message={paneError.copy.message}
              detail={paneError.copy.detail}
              onDismiss={onDismissPaneError}
            />
          )}

          {project === null ? (
            <EmptyState
              title="No Project Open"
              body="Open a project in Ingest to build its storyboard."
              action={{ label: "Go to Ingest", onClick: onGoToIngest }}
            />
          ) : transcript === null ? (
            <EmptyState
              title="No Transcript Yet"
              body="Transcribe the take here to build a storyboard."
              action={{
                label: transcribing ? "Transcribing…" : "Transcribe",
                onClick: () => {
                  if (!transcribing) {
                    onTranscribe();
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
      </section>

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
            job={exportJob}
            requestError={requestError}
            onExport={exportStoryboard}
            running={exportRunning}
            progressPercent={exportJob === null ? 0 : Math.round(exportJob.progress * 100)}
            onPreview={storyboardEmpty ? null : () => void preview(tier)}
            previewDisabled={project === null}
            onAnnounce={setMessage}
          />
        </section>
      </aside>
    </>
  );
}
