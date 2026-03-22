import { useState, useRef, useCallback } from "react";

export interface UseWebcamReturn {
  stream: MediaStream | null;
  isRecording: boolean;
  recordedChunks: Blob[];
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  startRecording: () => void;
  stopRecording: () => Blob | null;
}

export function useWebcam(): UseWebcamReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startCamera = useCallback(async () => {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    setStream(mediaStream);
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

  return {
    stream,
    isRecording,
    recordedChunks,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
  };
}
