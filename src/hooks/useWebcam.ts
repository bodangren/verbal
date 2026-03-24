import { useState, useRef, useCallback } from "react";

export interface UseWebcamReturn {
  stream: MediaStream | null;
  isRecording: boolean;
  recordedChunks: Blob[];
  error: string | null;
  availableDevices: MediaDeviceInfo[];
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  startRecording: () => void;
  stopRecording: () => Blob | null;
  clearError: () => void;
  enumerateDevices: () => Promise<MediaDeviceInfo[]>;
}

export function useWebcam(): UseWebcamReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setStream(mediaStream);
    } catch (e) {
      let errorMessage = "Failed to access camera";
      if (e instanceof Error) {
        console.error("[useWebcam] Camera access error:", {
          name: e.name,
          message: e.message,
          stack: e.stack,
        });
        if (e.name === "NotAllowedError") {
          errorMessage = `Permission denied: ${e.message}`;
        } else if (e.name === "NotFoundError") {
          errorMessage = `Camera not found: ${e.message}`;
        } else if (e.name === "NotReadableError") {
          errorMessage = `Camera unavailable: ${e.message}`;
        } else if (e.name === "OverconstrainedError") {
          errorMessage = `Camera constraints not met: ${e.message}`;
        } else if (e.name === "SecurityError") {
          errorMessage = `Security error: ${e.message}`;
        } else if (e.name === "AbortError") {
          errorMessage = `Camera access aborted: ${e.message}`;
        } else {
          errorMessage = `${e.name}: ${e.message}`;
        }
      }
      setError(errorMessage);
      setStream(null);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const startRecording = useCallback(() => {
    if (!stream) return;

    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
        setRecordedChunks([...chunks]);
      }
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
  }, [stream]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording) return null;

    const recorder = mediaRecorderRef.current;
    recorder.stop();
    setIsRecording(false);

    const blob = new Blob(recordedChunks, { type: "video/webm" });
    return blob;
  }, [isRecording, recordedChunks]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const filtered = devices.filter(d => d.kind === "videoinput" || d.kind === "audioinput");
      setAvailableDevices(filtered);
      console.log("[useWebcam] Available devices:", filtered);
      return filtered;
    } catch (e) {
      console.error("[useWebcam] Failed to enumerate devices:", e);
      return [];
    }
  }, []);

  return {
    stream,
    isRecording,
    recordedChunks,
    error,
    availableDevices,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    clearError,
    enumerateDevices,
  };
}
