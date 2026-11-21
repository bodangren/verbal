import { useEffect, useRef, useState } from "react";
import type { TranscriptDocument } from "@verbal/core";
import { useActiveWord, type PlaybackScheduler } from "../hooks/use-playback-sync";
import { timeFromClick } from "./waveform-seek";
import { TranscriptEditor } from "./TranscriptEditor";

export type PlaybackScreenProps = {
  transcript: TranscriptDocument;
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

/**
 * Video preview with a synchronised transcript.
 *
 * Clicking a word seeks to its start; the active word follows playback. The
 * transcript is not rebuilt per frame — only the active word's highlight
 * changes.
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
  const [loadFailed, setLoadFailed] = useState(false);

  const activeIndex = useActiveWord({
    words: transcript.words,
    getTime: () => videoRef.current?.currentTime ?? 0,
    active: playing,
    scheduler,
  });

  const activeWord = activeIndex >= 0 ? transcript.words[activeIndex] : undefined;

  // One transcript, one highlight: the page's editable copy follows playback
  // through this callback instead of a second read-only copy here.
  const activeWordId = activeWord?.id ?? null;
  useEffect(() => {
    onActiveWordChange?.(activeWordId);
  }, [activeWordId, onActiveWordChange]);

  const togglePlayback = () => {
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
  };

  const seekToWord = (_wordId: string, index: number) => {
    const video = videoRef.current;
    const word = transcript.words[index];

    if (video !== null && word !== undefined) {
      video.currentTime = word.start;
    }
  };

  return (
    <div className="playback">
      <video
        ref={(node) => {
          videoRef.current = node;
          onVideoReady?.(node);
        }}
        className="playback__video"
        src={mediaUrl}
        aria-label="Media preview"
        playsInline
        onError={() => {
          setLoadFailed(true);
          setPlaying(false);
        }}
        onLoadedData={() => setLoadFailed(false)}
      />

      {loadFailed && (
        <p className="status" role="alert">
          Media could not be loaded from {mediaUrl}. Re-import it, or check that
          the referenced file still exists.
        </p>
      )}

      {waveformUrl !== undefined && (
        <img
          className="playback__waveform"
          src={waveformUrl}
          alt="Waveform"
          onClick={(event) => {
            const video = videoRef.current;
            if (video === null) {
              return;
            }

            const rect = event.currentTarget.getBoundingClientRect();
            video.currentTime = timeFromClick({
              clientX: event.clientX,
              left: rect.left,
              width: rect.width,
              durationSeconds: video.duration,
            });
          }}
        />
      )}

      <div className="playback__controls">
        <button
          type="button"
          className="playback__button"
          onClick={togglePlayback}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "Pause" : "Play"}
        </button>
      </div>

      {showTranscript && (
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
