import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { BeatStatus, TakeAlignment } from "@verbal/takes";
import { alignTake, splitBeats } from "@verbal/takes";
import type { JobRecord, ProjectDocument } from "@verbal/core/browser";
import type { ReviewProposalView, TakeReviewLlm } from "../components/TakeReview";
import type {
  StudioCapture,
  StudioDevice,
  StudioTake,
  StudioTakeState,
} from "../components/StudioOverlay";
import type { WorkspaceMode } from "../components/TopBar";
import type { ErrorCopy } from "../lib/error-copy";
import { CaptureRecorder, type MediaRecorderLike } from "../lib/capture-recorder";
import {
  DEFAULT_FONT,
  DEFAULT_WPM,
  advanceWords,
  clampFontSize,
  clampWpm,
} from "../components/prompter-clock";
import {
  buildCut as buildCutRequest,
  getProject,
  getTakeTranscript,
  listTakes,
  previewTakeReview,
  renderCut as renderCutRequest,
  runTakeReview,
  startTakeTranscript,
  uploadTake,
} from "../lib/api-client";

export type PaneId = "browser" | "ingest" | "edit" | "deliver";

/** The page-level values and callbacks the Studio reads and mutates. */
export type StudioDeps = {
  /** Whether the Studio is open; Home owns the visibility switch. */
  open: boolean;
  root: string;
  script: string;
  projectName: string | null;
  words: number;
  readTime: string;
  reducedMotion: boolean;
  cameraAvailable: boolean;
  mode: WorkspaceMode;
  paneError: { pane: PaneId; copy: ErrorCopy } | null;
  /** Assigned by the hook so Home can reset the prompter on a script change. */
  resetPrompterRef: { current: () => void };
  onClose: () => void;
  onScriptChange: (text: string) => void;
  onUseTranscript: () => void;
  onDismissError: () => void;
  setMessage: (message: string | null) => void;
  setJob: (job: JobRecord) => void;
  setProject: (project: ProjectDocument) => void;
  pollJob: (id: string) => Promise<JobRecord>;
  guard: (run: () => Promise<void>, pane?: PaneId) => Promise<void>;
};

/** Everything the Studio overlay renders, plus the handlers it drives. */
export type StudioController = {
  videoRef: RefObject<HTMLVideoElement | null>;
  capture: StudioCapture;
  review: { takeId: string; alignment: TakeAlignment } | null;
  reviewing: boolean;
  reviewLlm: TakeReviewLlm;
  dimmedBeatIds: string[];
  cut: { ranges: number; durationSeconds: number; building: boolean } | null;
  rendering: boolean;
  prompter: {
    offsetWords: number;
    wpm: number;
    fontSize: number;
    mirror: boolean;
    playing: boolean;
  };
  onReview: (takeId: string) => void;
  onReread: (beatId: string) => void;
  onStatusChange: (beatId: string, status: BeatStatus) => void;
  onSeek: (seconds: number) => void;
  onBuildCut: () => void;
  onRenderCut: () => void;
  onTogglePlay: () => void;
  onWpmChange: (wpm: number) => void;
  onFontSizeChange: (size: number) => void;
  onToggleMirror: () => void;
  onReset: () => void;
  close: () => void;
};

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

/**
 * Owns every piece of webcam-recording and teleprompter state.
 *
 * The hook runs inside the Studio subtree (`StudioHost`), so the prompter's
 * 100 ms tick re-renders only the overlay, never `Home`. Home keeps the
 * visibility switch (`open`) and the results the page needs (script, job,
 * project, message, pane errors), which arrive here through `deps`.
 */
export function useStudio(deps: StudioDeps): StudioController {
  const {
    open,
    root,
    script,
    cameraAvailable,
    mode,
    resetPrompterRef,
    onClose,
    setMessage,
    setJob,
    setProject,
    pollJob,
    guard,
  } = deps;

  // Prompter.
  const [prompterOffset, setPrompterOffset] = useState(0);
  const [prompterWpm, setPrompterWpm] = useState(DEFAULT_WPM);
  const [prompterFontSize, setPrompterFontSize] = useState(DEFAULT_FONT);
  const [prompterMirror, setPrompterMirror] = useState(false);
  const [prompterPlaying, setPrompterPlaying] = useState(false);

  // Capture.
  const [previewing, setPreviewing] = useState(false);
  const [takeState, setTakeState] = useState<StudioTakeState>("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [takes, setTakes] = useState<StudioTake[]>([]);
  const [cameras, setCameras] = useState<StudioDevice[]>([]);
  const [microphones, setMicrophones] = useState<StudioDevice[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [microphoneId, setMicrophoneId] = useState<string | null>(null);

  // Review and cut.
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

  const recorderRef = useRef<CaptureRecorder | null>(null);
  const takeStartRef = useRef<number | null>(null);
  const takeCancelledRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const scriptBeats = splitBeats(script);

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

  // Opening the Studio starts the camera when one is available. The rAF defers
  // until the overlay (and its video element) is mounted.
  useEffect(() => {
    if (!open) {
      return;
    }
    requestAnimationFrame(() => {
      if (cameraAvailable && !previewing) {
        void startPreview();
      } else {
        void refreshDevices();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A project change reloads the take list, as loadProjectFiles did.
  useEffect(() => {
    // No project is open yet: there is nothing to list, and the API answers 400.
    if (root === "") {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await listTakes(root);
        if (!cancelled) {
          setTakes(result.takes);
        }
      } catch {
        if (!cancelled) {
          setTakes([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root]);

  // Home resets the prompter on a script change through this handle.
  const resetPrompter = useCallback(() => {
    setPrompterOffset(0);
    setPrompterPlaying(false);
  }, []);

  useEffect(() => {
    resetPrompterRef.current = resetPrompter;
    return () => {
      resetPrompterRef.current = () => undefined;
    };
  }, [resetPrompterRef, resetPrompter]);

  function stopPreview() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setPreviewing(false);
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

  function changeCamera(id: string) {
    setCameraId(id === "" ? null : id);
    stopPreview();
  }

  function changeMicrophone(id: string) {
    setMicrophoneId(id === "" ? null : id);
    stopPreview();
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
      const job = await uploadTake({
        root,
        takeId,
        durationSeconds: Number(duration.toFixed(3)),
        dataBase64,
      });
      setJob(job);
      const finished = await pollJob(job.id);
      if (finished.status !== "done") {
        throw new Error(finished.error ?? `normalize ${finished.status}`);
      }

      const saved = await listTakes(root);
      setTakes(saved.takes);
      setProject(await getProject(root));
      setMessage("Take saved");
      setRereadTarget(null);
      setLlmReview(null);
      setCut(null);
      setRendering(false);
      setTakeState("idle");
      setElapsedSeconds(0);
    });
  }

  function reviewTake(takeId: string) {
    return guard(async () => {
      setReviewing(true);
      const started = await startTakeTranscript(root, takeId);
      setJob(started);

      const finished = await pollJob(started.id);
      if (finished.status !== "done") {
        throw new Error(finished.error ?? `transcribe ${finished.status}`);
      }

      const saved = await getTakeTranscript(root, takeId);
      setReview({ takeId, alignment: alignTake(scriptBeats, saved.words) });
      setLlmReview(null);
      setRereadTarget(null);
      setCut(null);
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
      const preview = await previewTakeReview(root, takeId);
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
      const result = await runTakeReview(root, takeId);
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
      const result = await buildCutRequest(root, takeId);
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
      const started = await renderCutRequest(root, takeId);
      setJob(started);
      const finished = await pollJob(started.id);
      if (finished.status !== "done") {
        throw new Error(finished.error ?? `render ${finished.status}`);
      }
      setProject(await getProject(root));
      setMessage("Cut rendered");
    }).finally(() => setRendering(false));
  }

  function close() {
    takeCancelledRef.current = true;
    if (takeState === "recording") {
      void stopTake();
    }
    onClose();
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

  const capture: StudioCapture = {
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
  };

  const reviewLlm: TakeReviewLlm = {
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
  };

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

  return {
    videoRef,
    capture,
    review,
    reviewing,
    reviewLlm,
    dimmedBeatIds,
    cut,
    rendering,
    prompter: {
      offsetWords: prompterOffset,
      wpm: prompterWpm,
      fontSize: prompterFontSize,
      mirror: prompterMirror,
      playing: prompterPlaying,
    },
    onReview: (takeId) => void reviewTake(takeId),
    onReread: rereadBeat,
    onStatusChange: overrideReviewStatus,
    onSeek: seekReview,
    onBuildCut: () => {
      if (review !== null) {
        void buildCut(review.takeId);
      }
    },
    onRenderCut: () => {
      if (review !== null) {
        void renderCut(review.takeId);
      }
    },
    onTogglePlay: () => setPrompterPlaying((value) => !value),
    onWpmChange: (value) => setPrompterWpm(clampWpm(value)),
    onFontSizeChange: (value) => setPrompterFontSize(clampFontSize(value)),
    onToggleMirror: () => setPrompterMirror((value) => !value),
    onReset: resetPrompter,
    close,
  };
}
