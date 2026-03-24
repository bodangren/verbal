import { useRef, useEffect } from "react";
import { useWebcam } from "../hooks/useWebcam";

export interface WebcamRecorderProps {
  onRecordingComplete?: (blob: Blob) => void;
}

export function WebcamRecorder({ onRecordingComplete }: WebcamRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    stream,
    isRecording,
    error,
    availableDevices,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    clearError,
    enumerateDevices,
  } = useWebcam();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  const handleStartCamera = async () => {
    await startCamera();
  };

  const handleStopCamera = () => {
    stopCamera();
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleStartRecording = () => {
    startRecording();
  };

  const handleStopRecording = () => {
    const blob = stopRecording();
    if (blob && onRecordingComplete) {
      onRecordingComplete(blob);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {error && (
        <div className="w-full max-w-2xl bg-red-900/50 border border-red-500 rounded-lg p-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-red-400">Camera Error</h3>
            <p className="text-sm text-red-300">{error}</p>
          </div>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-300 text-xl leading-none"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      {!stream ? (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleStartCamera}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Start Camera
          </button>
          {availableDevices.length > 0 && (
            <p className="text-xs text-gray-400">
              {availableDevices.filter(d => d.kind === "videoinput").length} camera(s) available
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-w-2xl rounded-lg shadow-lg"
              role="img"
              aria-label="Webcam preview"
            />
            {isRecording && (
              <div className="absolute top-2 left-2 flex items-center gap-2 bg-red-600 text-white px-2 py-1 rounded text-sm">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                Recording
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {isRecording ? (
              <button
                onClick={handleStopRecording}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Stop Recording
              </button>
            ) : (
              <button
                onClick={handleStartRecording}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Record
              </button>
            )}
            <button
              onClick={handleStopCamera}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Stop Camera
            </button>
          </div>
        </>
      )}
    </div>
  );
}
