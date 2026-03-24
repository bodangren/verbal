import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebcam } from "./useWebcam";

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("useWebcam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: initialize succeeds
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "plugin:crabcamera|initialize_camera_system") {
        return Promise.resolve();
      }
      return Promise.reject(new Error(`Unhandled command: ${cmd}`));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should start with inactive state and not recording", () => {
      const { result } = renderHook(() => useWebcam());

      expect(result.current.isActive).toBe(false);
      expect(result.current.isRecording).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.canvasRef).toBeDefined();
    });

    it("should initialize camera system on mount", () => {
      renderHook(() => useWebcam());

      expect(mockInvoke).toHaveBeenCalledWith(
        "plugin:crabcamera|initialize_camera_system"
      );
    });
  });

  describe("device enumeration", () => {
    it("should enumerate available cameras", async () => {
      const mockCameras = [
        { id: "cam1", name: "Camera 1", description: "Built-in webcam" },
        { id: "cam2", name: "Camera 2", description: "External webcam" },
      ];
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras")
          return Promise.resolve(mockCameras);
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      let devices: unknown[];
      await act(async () => {
        devices = await result.current.enumerateDevices();
      });

      expect(devices!.length).toBe(2);
      expect(result.current.availableDevices.length).toBe(2);
      expect(result.current.availableDevices[0].name).toBe("Camera 1");
    });

    it("should return empty array if enumeration fails", async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras")
          return Promise.reject(new Error("No permission"));
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      let devices: unknown[];
      await act(async () => {
        devices = await result.current.enumerateDevices();
      });

      expect(devices!).toEqual([]);
    });
  });

  describe("camera start/stop", () => {
    it("should start camera with first available device", async () => {
      const mockCameras = [
        { id: "cam1", name: "Camera 1", description: "Webcam" },
      ];
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras")
          return Promise.resolve(mockCameras);
        if (cmd === "plugin:crabcamera|capture_single_photo")
          return Promise.resolve({ data: [255, 0, 0], width: 1, height: 1, format: "rgb", device_id: "cam1", size_bytes: 3 });
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.selectedDeviceId).toBe("cam1");
    });

    it("should start camera with specified device ID", async () => {
      const mockCameras = [
        { id: "cam1", name: "Camera 1", description: "" },
        { id: "cam2", name: "Camera 2", description: "" },
      ];
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras")
          return Promise.resolve(mockCameras);
        if (cmd === "plugin:crabcamera|capture_single_photo")
          return Promise.resolve({ data: [255, 0, 0], width: 1, height: 1, format: "rgb", device_id: "cam2", size_bytes: 3 });
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera("cam2");
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.selectedDeviceId).toBe("cam2");
    });

    it("should set error when no cameras found", async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras")
          return Promise.resolve([]);
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      expect(result.current.isActive).toBe(false);
      expect(result.current.error).toBe("No camera found");
    });

    it("should stop camera", async () => {
      const mockCameras = [
        { id: "cam1", name: "Camera 1", description: "" },
      ];
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras")
          return Promise.resolve(mockCameras);
        if (cmd === "plugin:crabcamera|capture_single_photo")
          return Promise.resolve({ data: [255, 0, 0], width: 1, height: 1, format: "rgb", device_id: "cam1", size_bytes: 3 });
        if (cmd === "plugin:crabcamera|release_camera")
          return Promise.resolve();
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      expect(result.current.isActive).toBe(true);

      act(() => {
        result.current.stopCamera();
      });

      expect(result.current.isActive).toBe(false);
    });

    it("should clear error on successful camera start after failure", async () => {
      let callCount = 0;
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras") {
          callCount++;
          if (callCount === 1) return Promise.resolve([]);
          return Promise.resolve([
            { id: "cam1", name: "Camera 1", description: "" },
          ]);
        }
        if (cmd === "plugin:crabcamera|capture_single_photo")
          return Promise.resolve({ data: [255, 0, 0], width: 1, height: 1, format: "rgb", device_id: "cam1", size_bytes: 3 });
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      expect(result.current.error).toBe("No camera found");

      await act(async () => {
        await result.current.startCamera();
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should clear error when clearError is called", async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras")
          return Promise.resolve([]);
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("recording controls", () => {
    it("should not start recording if camera is not active", async () => {
      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(false);
    });

    it("should start recording when camera is active", async () => {
      const mockCameras = [
        { id: "cam1", name: "Camera 1", description: "" },
      ];
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras")
          return Promise.resolve(mockCameras);
        if (cmd === "plugin:crabcamera|capture_single_photo")
          return Promise.resolve({ data: [255, 0, 0], width: 1, height: 1, format: "rgb", device_id: "cam1", size_bytes: 3 });
        if (cmd === "plugin:crabcamera|start_recording")
          return Promise.resolve("session-123");
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith(
        "plugin:crabcamera|start_recording",
        expect.objectContaining({
          deviceId: "cam1",
          width: 1280,
          height: 720,
          fps: 30,
        })
      );
    });

    it("should stop recording with session ID", async () => {
      const mockCameras = [
        { id: "cam1", name: "Camera 1", description: "" },
      ];
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras")
          return Promise.resolve(mockCameras);
        if (cmd === "plugin:crabcamera|capture_single_photo")
          return Promise.resolve({ data: [255, 0, 0], width: 1, height: 1, format: "rgb", device_id: "cam1", size_bytes: 3 });
        if (cmd === "plugin:crabcamera|start_recording")
          return Promise.resolve("session-123");
        if (cmd === "plugin:crabcamera|stop_recording")
          return Promise.resolve({ output_path: "/tmp/recording.mp4", video_frames: 300, duration_secs: 10.0, bytes_written: 5000000 });
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(true);

      let recordingResult: string | null = null;
      await act(async () => {
        recordingResult = await result.current.stopRecording();
      });

      expect(result.current.isRecording).toBe(false);
      expect(recordingResult).toBe("/tmp/recording.mp4");
      expect(mockInvoke).toHaveBeenCalledWith(
        "plugin:crabcamera|stop_recording",
        { sessionId: "session-123" }
      );
    });

    it("should set error when recording fails to start", async () => {
      const mockCameras = [
        { id: "cam1", name: "Camera 1", description: "" },
      ];
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "plugin:crabcamera|initialize_camera_system")
          return Promise.resolve();
        if (cmd === "plugin:crabcamera|get_available_cameras")
          return Promise.resolve(mockCameras);
        if (cmd === "plugin:crabcamera|capture_single_photo")
          return Promise.resolve({ data: [255, 0, 0], width: 1, height: 1, format: "rgb", device_id: "cam1", size_bytes: 3 });
        if (cmd === "plugin:crabcamera|start_recording")
          return Promise.reject(new Error("Device busy"));
        return Promise.reject(new Error(`Unhandled: ${cmd}`));
      });

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.error).toContain("Device busy");
    });
  });
});
