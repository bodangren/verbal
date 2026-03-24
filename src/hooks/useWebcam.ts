import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface CameraDevice {
  id: string;
  name: string;
  description: string | null;
  is_available: boolean;
}

interface CameraFrame {
  data: number[];
  width: number;
  height: number;
  format: string;
  device_id: string;
  size_bytes: number;
}

export interface UseWebcamReturn {
  isActive: boolean;
  isRecording: boolean;
  error: string | null;
  availableDevices: CameraDevice[];
  selectedDeviceId: string | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  startCamera: (deviceId?: string) => Promise<void>;
  stopCamera: () => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  clearError: () => void;
  enumerateDevices: () => Promise<CameraDevice[]>;
}

export function useWebcam(): UseWebcamReturn {
  const [isActive, setIsActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableDevices, setAvailableDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeDeviceRef = useRef<string | null>(null);
  const recordingSessionRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const previewRunningRef = useRef(false);

  // Initialize CrabCamera system once
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    invoke("plugin:crabcamera|initialize_camera_system")
      .then((msg) => {
        console.log("[useWebcam] Camera system initialized:", msg);
      })
      .catch((e) => {
        const errStr = e instanceof Error ? e.message : String(e);
        console.error("[useWebcam] Failed to initialize camera system:", errStr);
      });
  }, []);

  const enumerateDevices = useCallback(async (): Promise<CameraDevice[]> => {
    try {
      const cameras = await invoke<CameraDevice[]>(
        "plugin:crabcamera|get_available_cameras"
      );
      setAvailableDevices(cameras);
      console.log("[useWebcam] Available cameras:", cameras);
      return cameras;
    } catch (e) {
      console.error("[useWebcam] Failed to enumerate devices:", e);
      setError(`Camera enumeration failed: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }, []);

  const drawFrameToCanvas = useCallback((frame: CameraFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions to match frame
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
    }

    // Frame data is raw RGB pixels from V4L2/nokhwa
    const imageData = ctx.createImageData(frame.width, frame.height);
    const pixels = imageData.data; // RGBA
    const src = frame.data;

    // Convert RGB to RGBA
    const pixelCount = frame.width * frame.height;
    for (let i = 0; i < pixelCount; i++) {
      pixels[i * 4] = src[i * 3];       // R
      pixels[i * 4 + 1] = src[i * 3 + 1]; // G
      pixels[i * 4 + 2] = src[i * 3 + 2]; // B
      pixels[i * 4 + 3] = 255;           // A
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  const startPreviewLoop = useCallback(() => {
    previewRunningRef.current = true;

    const captureLoop = async () => {
      if (!previewRunningRef.current || !activeDeviceRef.current) return;

      try {
        const frame = await invoke<CameraFrame>(
          "plugin:crabcamera|capture_single_photo",
          { deviceId: activeDeviceRef.current }
        );
        if (frame && frame.data) {
          drawFrameToCanvas(frame);
        }
      } catch (e) {
        console.warn("[useWebcam] Frame capture failed:", e);
      }

      // Schedule next frame if still running
      if (previewRunningRef.current) {
        requestAnimationFrame(captureLoop);
      }
    };

    requestAnimationFrame(captureLoop);
  }, [drawFrameToCanvas]);

  const stopPreviewLoop = useCallback(() => {
    previewRunningRef.current = false;
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      setError(null);
      try {
        let devices = availableDevices;
        if (devices.length === 0) {
          devices = await enumerateDevices();
        }

        const targetId = deviceId || (devices.length > 0 ? devices[0].id : null);
        if (!targetId) {
          setError("No camera found");
          return;
        }

        activeDeviceRef.current = targetId;
        setSelectedDeviceId(targetId);
        setIsActive(true);
        startPreviewLoop();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[useWebcam] Camera start error:", e);
        setError(`Failed to start camera: ${message}`);
        setIsActive(false);
        activeDeviceRef.current = null;
      }
    },
    [availableDevices, enumerateDevices, startPreviewLoop]
  );

  const stopCamera = useCallback(() => {
    stopPreviewLoop();
    activeDeviceRef.current = null;
    setIsActive(false);

    // Release the camera device
    invoke("plugin:crabcamera|release_camera", {
      deviceId: selectedDeviceId,
    }).catch((e) => console.warn("[useWebcam] Release camera failed:", e));
  }, [stopPreviewLoop, selectedDeviceId]);

  const startRecording = useCallback(async () => {
    if (!activeDeviceRef.current) return;
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outputPath = `recording_${timestamp}.mp4`;

      const sessionId = await invoke<string>(
        "plugin:crabcamera|start_recording",
        {
          deviceId: activeDeviceRef.current,
          outputPath,
          width: 1280,
          height: 720,
          fps: 30.0,
          quality: null,
          title: null,
        }
      );
      recordingSessionRef.current = sessionId;
      console.log("[useWebcam] Recording started, session:", sessionId);
      setIsRecording(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[useWebcam] Recording start error:", e);
      setError(`Failed to start recording: ${message}`);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!isRecording || !recordingSessionRef.current) return null;
    try {
      const stats = await invoke<{ output_path?: string }>(
        "plugin:crabcamera|stop_recording",
        { sessionId: recordingSessionRef.current }
      );
      recordingSessionRef.current = null;
      setIsRecording(false);
      return stats.output_path || "recording_saved";
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[useWebcam] Recording stop error:", e);
      setError(`Failed to stop recording: ${message}`);
      recordingSessionRef.current = null;
      setIsRecording(false);
      return null;
    }
  }, [isRecording]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      previewRunningRef.current = false;
      activeDeviceRef.current = null;
    };
  }, []);

  return {
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
  };
}
