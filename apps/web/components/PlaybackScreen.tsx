import { useEffect, useRef, useState } from "react";
import type { TranscriptDocument } from "@verbal/core/browser";
import { useActiveWord, type PlaybackScheduler } from "../hooks/use-playback-sync";
import { timeFromClick } from "./waveform-seek";
import { TranscriptEditor } from "./TranscriptEditor";

export type PlaybackScreenProps = {
  /** Null before transcription: the take can still be played and scrubbed. */
  transcript: TranscriptDocument | null;
  mediaUrl: string;
  /** Accessible name of the transcript region inside the screen. */
  transcriptLabel?: string;
  /** Waveform strip for the media, when one could be rendered. */
  waveformUrl?: string;
  /** Render the built-in read-only transcript. Off when the page owns one. */
  showTranscript?: boolean;
  /** Reported as playback advances, for a transcript rendered elsewhere. */
  onActiveWordChange?: (wordId: string | null) => void;
  /** Handed the video element, so an external transcript can seek it. */
  onVideoReady?: (video: HTMLVideoElement | null) => void;
  /** Injectable scheduler for deterministic tests. */
  scheduler?: PlaybackScheduler;
};

/** Seconds as m:ss, so the transport reads like a player. */
export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/**
 * Video preview with a transport, a scrubber, and a synchronised transcript.
 *
 * The player exists whenever a take exists — not only after transcription.
 * Play/pause works from the control or by clicking the video; the take scrubs
 * by clicking the waveform, dragging the range, or its keyboard bindings.
 * Clicking a transcript word seeks to its start.
 */
export function PlaybackScreen({
  transcript,
  mediaUrl,
  transcriptLabel,
  waveformUrl,
  showTranscript = true,
  onActiveWordChange,
  onVideoReady,
  scheduler,
}: PlaybackScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  const words = transcript?.words ?? [];

  const activeIndex = useActiveWord({
    words,
    getTime: () => videoRef.current?.currentTime ?? 0,
    active: playing,
    scheduler,
  });

  const activeWord =
    transcript !== null && activeIndex >= 0 ? transcript.words[activeIndex] : undefined;

  // One transcript, one highlight: the page's editable copy follows playback
  // through this callback instead of a second read-only copy here.
  const activeWordId = activeWord?.id ?? null;
  useEffect(() => {
    onActiveWordChange?.(activeWordId);
  }, [activeWordId, onActiveWordChange]);

  function togglePlayback() {
    const video = videoRef.current;
    if (video === null) {
      return;
    }

    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      void video.play();
      setPlaying(true);
    }
  }

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (video === null) {
      return;
    }

    const max = Number.isFinite(video.duration) ? video.duration : seconds;
    const next = Math.min(Math.max(seconds, 0), max);
    video.currentTime = next;
    setCurrentTime(next);
  }

  function seekToWord(_wordId: string, index: number) {
    const word = transcript?.words[index];
    if (word !== undefined) {
      seekTo(word.start);
    }
  }

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const canSeek = safeDuration > 0;
  const progress = canSeek ? Math.min(currentTime / safeDuration, 1) : 0;

  return (
    <div className="playback">
      <div className="playback__video-wrap">
        <video
          ref={(node) => {
            videoRef.current = node;
            onVideoReady?.(node);
          }}
          className="playback__video"
          src={mediaUrl}
          aria-label="Media preview"
          playsInline
          onClick={togglePlayback}
          onError={() => {
            setLoadFailed(true);
            setPlaying(false);
          }}
          onLoadedData={() => setLoadFailed(false)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />

        {!playing && !loadFailed && (
          <span className="playback__overlay" aria-hidden="true">
            ▶
          </span>
        )}
      </div>

      {loadFailed && (
        <p className="status" role="alert">
          Media could not be loaded from {mediaUrl}. Re-import it, or check that the
          referenced file still exists.
        </p>
      )}

      <div className="playback__timeline">
        {waveformUrl !== undefined ? (
          <img
            className="playback__waveform"
            src={waveformUrl}
            alt=""
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              seekTo(
                timeFromClick({
                  clientX: event.clientX,
                  left: rect.left,
                  width: rect.width,
                  durationSeconds: videoRef.current?.duration ?? safeDuration,
                }),
              );
            }}
          />
        ) : (
          <span className="playback__track" aria-hidden="true" />
        )}

        <span
          className="playback__playhead"
          style={{ left: `${progress * 100}%` }}
          aria-hidden="true"
        />
      </div>

      <input
        type="range"
        className="playback__scrub"
        aria-label="Seek"
        aria-valuetext={`${formatPlaybackTime(currentTime)} of ${formatPlaybackTime(duration)}`}
        min={0}
        max={canSeek ? safeDuration : 0}
        step={0.01}
        value={canSeek ? Math.min(currentTime, safeDuration) : 0}
        disabled={!canSeek}
        onChange={(event) => seekTo(Number(event.target.value))}
      />

      <div className="playback__controls">
        <button
          type="button"
          className="playback__button"
          onClick={togglePlayback}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="playback__time">
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
        </span>
        <span className="playback__hint">Click the video to play · drag to scrub</span>
      </div>

      {showTranscript && transcript !== null && (
        <TranscriptEditor
          transcript={transcript}
          label={transcriptLabel}
          activeWordId={activeWordId}
          onWordClick={seekToWord}
        />
      )}
    </div>
  );
}
