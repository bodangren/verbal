import { useRef, useState, useEffect, useCallback } from "react";
import type { TranscriptSegment } from "./TranscriptEditor";

export interface VideoPlayerProps {
  src?: string;
  stream?: MediaStream;
  transcript?: TranscriptSegment[];
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  onSeek?: (time: number) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  stream,
  transcript,
  currentTime: externalCurrentTime,
  onTimeUpdate,
  onSeek,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [internalCurrentTime, setInternalCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const currentTime = externalCurrentTime ?? internalCurrentTime;

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (videoRef.current && externalCurrentTime !== undefined) {
      videoRef.current.currentTime = externalCurrentTime;
    }
  }, [externalCurrentTime]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setInternalCurrentTime(time);
      onTimeUpdate?.(time);
    }
  }, [onTimeUpdate]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleSeek = useCallback(
    (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        onSeek?.(time);
      }
    },
    [onSeek]
  );

  const handleWordClick = useCallback(
    (startTime: number) => {
      handleSeek(startTime);
    },
    [handleSeek]
  );

  return (
    <div className="video-player flex flex-col gap-2">
      <div className="relative">
        <video
          ref={videoRef}
          src={src}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          className="w-full max-w-2xl rounded-lg shadow-lg"
          role="img"
          aria-label="Video player"
        />
      </div>

      <div className="flex items-center gap-4 bg-gray-800 p-2 rounded">
        <button
          type="button"
          onClick={togglePlay}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <span className="text-gray-300 text-sm">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
          className="flex-1"
        />
      </div>

      {transcript && (
        <div className="transcript-overlay p-2 bg-gray-900 rounded text-gray-300 text-sm max-h-32 overflow-y-auto">
          {transcript.map((segment) => (
            <span key={segment.id} className="inline">
              {segment.words.map((word, idx) => {
                const isActive = currentTime >= word.start && currentTime <= word.end;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleWordClick(word.start)}
                    className={`px-1 rounded ${
                      isActive
                        ? "bg-yellow-500 text-black"
                        : "hover:bg-gray-700"
                    }`}
                  >
                    {word.word}
                  </button>
                );
              })}{" "}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
