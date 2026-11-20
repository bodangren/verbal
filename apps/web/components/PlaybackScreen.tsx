import { useRef, useState } from "react";
import type { TranscriptDocument } from "@verbal/core";
import { useActiveWord, type PlaybackScheduler } from "../hooks/use-playback-sync";
import { TranscriptEditor } from "./TranscriptEditor";

export type PlaybackScreenProps = {
  transcript: TranscriptDocument;
  mediaUrl: string;
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
export function PlaybackScreen({ transcript, mediaUrl, scheduler }: PlaybackScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const activeIndex = useActiveWord({
    words: transcript.words,
    getTime: () => videoRef.current?.currentTime ?? 0,
    active: playing,
    scheduler,
  });

  const activeWord = activeIndex >= 0 ? transcript.words[activeIndex] : undefined;

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
        ref={videoRef}
        className="playback__video"
        src={mediaUrl}
        aria-label="Media preview"
        playsInline
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
      </div>

      <TranscriptEditor
        transcript={transcript}
        activeWordId={activeWord?.id ?? null}
        onWordClick={seekToWord}
      />
    </div>
  );
}
