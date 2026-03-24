import { useState, useRef, useCallback } from "react";

export interface UseWebcamReturn {
  stream: MediaStream | null;
  isRecording: boolean;
  recordedChunks: Blob[];
  error: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  startRecording: () => void;
  stopRecording: () => Blob | null;
  clearError: () => void;
}

export function useWebcam(): UseWebcamReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);
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
        if (e.name === "NotAllowedError") {
          errorMessage = `Permission denied: ${e.message}`;
        } else if (e.name === "NotFoundError") {
          errorMessage = `Camera not found: ${e.message}`;
        } else if (e.name === "NotReadableError") {
          errorMessage = `Camera unavailable: ${e.message}`;
        } else {
          errorMessage = e.message;
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

  return {
    stream,
    isRecording,
    recordedChunks,
    error,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    clearError,
  };
}
