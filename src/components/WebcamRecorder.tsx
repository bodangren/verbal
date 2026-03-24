import { useEffect, useState } from "react";
import { useWebcam } from "../hooks/useWebcam";

export interface WebcamRecorderProps {
  onRecordingComplete?: (path: string) => void;
}

export function WebcamRecorder({ onRecordingComplete }: WebcamRecorderProps) {
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const {
    isActive,
    isRecording,
    error,
    availableDevices,
    selectedDeviceId,
    canvasRef,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    clearError,
    enumerateDevices,
  } = useWebcam();

  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  useEffect(() => {
    if (selectedDeviceId && !selectedCamera) {
      setSelectedCamera(selectedDeviceId);
    }
  }, [selectedDeviceId, selectedCamera]);

  const handleStartCamera = async () => {
    await startCamera(selectedCamera || undefined);
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCamera(e.target.value);
  };

  const handleStopCamera = () => {
    stopCamera();
  };

  const handleStartRecording = async () => {
    await startRecording();
  };

  const handleStopRecording = async () => {
    const result = await stopRecording();
    if (result && onRecordingComplete) {
      onRecordingComplete(result);
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
      {!isActive ? (
        <div className="flex flex-col items-center gap-3">
          {availableDevices.length > 1 && (
            <select
              value={selectedCamera}
              onChange={handleCameraChange}
              className="px-3 py-2 bg-gray-800 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              aria-label="Select camera"
            >
              <option value="">Default Camera</option>
              {availableDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name || `Camera ${device.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleStartCamera}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Start Camera
          </button>
          {availableDevices.length > 0 && (
            <p className="text-xs text-gray-400">
              {availableDevices.length} camera(s) available
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="w-full max-w-2xl rounded-lg shadow-lg"
              role="img"
              aria-label="Camera preview"
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
