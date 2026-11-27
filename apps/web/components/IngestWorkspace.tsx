import { useEffect, useState } from "react";
import type { ProjectDocument, TranscriptDocument } from "@verbal/core/browser";
import type { MediaInfo } from "@verbal/media";
import { countWords, formatReadTime, readTimeSeconds } from "@verbal/takes";
import { IngestStage, type MediaState } from "../components/IngestStage";
import { IngestInspector, type ProbeSummary } from "../components/IngestInspector";
import { ScriptEditor } from "../components/ScriptEditor";
import { EmptyState } from "../components/EmptyState";
import { PaneAlert } from "../components/PaneAlert";
import type { PaneId } from "../hooks/use-studio";
import type { ErrorCopy } from "../lib/error-copy";
import { getSystem, probeMedia } from "../lib/api-client";
import { useJob } from "../hooks/use-job";

export type IngestWorkspaceProps = {
  /** True only while Ingest is the active mode; hides the pane, not the state. */
  active: boolean;
  project: ProjectDocument | null;
  root: string;
  transcript: TranscriptDocument | null;
  transcribeFailure: string | null;
  hasEdits: boolean;
  script: string;
  paneError: { pane: PaneId; copy: ErrorCopy } | null;
  onDismissPaneError: () => void;
  onOpenMediaPicker: () => void;
  onOpenStudio: () => void;
  onTranscribe: () => void;
  onOpenBatch: () => void;
  onScriptChange: (text: string) => void;
  onUseTranscript: () => void;
  onOpenInEdit: () => void;
  onNewProject: () => void;
};

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

/**
 * The Ingest workspace: the import and transcription stage plus the media
 * inspector. It owns the probe and the provider label, which only Ingest shows.
 */
export function IngestWorkspace({
  active,
  project,
  root,
  transcript,
  transcribeFailure,
  hasEdits,
  script,
  paneError,
  onDismissPaneError,
  onOpenMediaPicker,
  onOpenStudio,
  onTranscribe,
  onOpenBatch,
  onScriptChange,
  onUseTranscript,
  onOpenInEdit,
  onNewProject,
}: IngestWorkspaceProps) {
  const { job } = useJob();
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
        const info = await probeMedia(mediaPath);
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
        const system = await getSystem();
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

  // Stay mounted in every mode so the probe and provider survive a mode switch,
  // exactly as they did when they lived in Home. Only the pane hides.
  if (!active) {
    return null;
  }

  const hasMedia = project?.media !== undefined;
  const liveWords =
    transcript === null ? 0 : transcript.words.length - transcript.removedWordIds.length;
  const transcribing =
    job !== null &&
    job.kind === "transcribe" &&
    (job.status === "queued" || job.status === "running");

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

  const scriptWords = countWords(script);

  return (
    <>
      <section className="stage" aria-label="ingest workspace">
        <IngestStage
          projectName={project?.name ?? null}
          mediaName={projectMediaName(project)}
          state={mediaState}
          provider={transcription.label}
          cloud={transcription.cloud}
          hint={transcription.hint}
          onImport={() => {
            if (project !== null) {
              onOpenMediaPicker();
            }
          }}
          onRecord={onOpenStudio}
          hasEdits={hasEdits}
          removedWords={transcript?.removedWordIds.length ?? 0}
          silences={transcript?.silences?.length ?? 0}
          onTranscribe={onTranscribe}
          onRetry={onTranscribe}
          onTranscribeSeveral={onOpenBatch}
        >
          {paneError?.pane === "ingest" && (
            <PaneAlert
              message={paneError.copy.message}
              detail={paneError.copy.detail}
              onDismiss={onDismissPaneError}
            />
          )}

          {project === null && (
            <EmptyState
              title="No Project Open"
              body="Pick a project in the browser, or create one in the folder you are browsing."
              action={{ label: "New Project", onClick: onNewProject }}
            />
          )}

          {project !== null && (
            <ScriptEditor
              script={script}
              words={scriptWords}
              readTime={formatReadTime(readTimeSeconds(scriptWords))}
              onScriptChange={onScriptChange}
              onUseTranscript={onUseTranscript}
              onOpenStudio={onOpenStudio}
            />
          )}
        </IngestStage>
      </section>

      <IngestInspector
        probe={probe}
        probeError={probeError}
        probeLoading={probeLoading}
        hasMedia={hasMedia}
        hasTranscript={transcript !== null && liveWords > 0}
        transcribing={transcribing}
        onOpenInEdit={onOpenInEdit}
      />
    </>
  );
}
