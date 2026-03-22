import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebcam } from "./useWebcam";

describe("useWebcam", () => {
  const mockGetUserMedia = vi.fn();
  const mockMediaRecorder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: {
        getUserMedia: mockGetUserMedia,
      },
      writable: true,
      configurable: true,
    });

    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    };

    mockGetUserMedia.mockResolvedValue(mockStream);

    const mockRecorderInstance = {
      start: vi.fn(),
      stop: vi.fn(),
      ondataavailable: null as ((event: { data: Blob }) => void) | null,
      onstop: null as (() => void) | null,
      state: "inactive",
    };

    mockMediaRecorder.mockImplementation(() => mockRecorderInstance);
    (globalThis as unknown as { MediaRecorder: typeof mockMediaRecorder }).MediaRecorder = mockMediaRecorder;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("stream acquisition", () => {
    it("should start with null stream and not recording", () => {
      const { result } = renderHook(() => useWebcam());

      expect(result.current.stream).toBeNull();
      expect(result.current.isRecording).toBe(false);
    });

    it("should request camera access when startCamera is called", async () => {
      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      expect(mockGetUserMedia).toHaveBeenCalledWith({ video: true, audio: true });
    });

    it("should set stream when camera access is granted", async () => {
      const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
      mockGetUserMedia.mockResolvedValue(mockStream);

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      expect(result.current.stream).toBe(mockStream);
    });

    it("should throw error when camera access is denied", async () => {
      const mockError = new Error("Permission denied");
      mockGetUserMedia.mockRejectedValue(mockError);

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        try {
          await result.current.startCamera();
        } catch (e) {
          expect(e).toBe(mockError);
        }
      });

      expect(result.current.stream).toBeNull();
    });

    it("should stop all tracks when stopCamera is called", async () => {
      const mockStop = vi.fn();
      const mockStream = { getTracks: () => [{ stop: mockStop }] };
      mockGetUserMedia.mockResolvedValue(mockStream);

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      act(() => {
        result.current.stopCamera();
      });

      expect(mockStop).toHaveBeenCalled();
      expect(result.current.stream).toBeNull();
    });
  });

  describe("recording controls", () => {
    it("should not start recording if stream is null", () => {
      const { result } = renderHook(() => useWebcam());

      act(() => {
        result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(false);
    });

    it("should start recording when stream is available", async () => {
      const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
      mockGetUserMedia.mockResolvedValue(mockStream);

      const mockRecorderInstance = {
        start: vi.fn(),
        stop: vi.fn(),
        ondataavailable: null as ((event: { data: Blob }) => void) | null,
        onstop: null as (() => void) | null,
        state: "inactive",
      };
      mockMediaRecorder.mockImplementation(() => mockRecorderInstance);

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      act(() => {
        result.current.startRecording();
      });

      expect(mockRecorderInstance.start).toHaveBeenCalled();
      expect(result.current.isRecording).toBe(true);
    });

    it("should stop recording and return recorded chunks", async () => {
      const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
      mockGetUserMedia.mockResolvedValue(mockStream);

      const mockRecorderInstance = {
        start: vi.fn(),
        stop: vi.fn(),
        ondataavailable: null as ((event: { data: Blob }) => void) | null,
        onstop: null as (() => void) | null,
        state: "recording" as const,
      };
      mockMediaRecorder.mockImplementation(() => mockRecorderInstance);

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      act(() => {
        result.current.startRecording();
      });

      let recordedBlob: Blob | null = null;

      act(() => {
        recordedBlob = result.current.stopRecording();
      });

      expect(mockRecorderInstance.stop).toHaveBeenCalled();
      expect(result.current.isRecording).toBe(false);
      expect(recordedBlob).toBeInstanceOf(Blob);
    });

    it("should collect data during recording", async () => {
      const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
      mockGetUserMedia.mockResolvedValue(mockStream);

      const mockRecorderInstance = {
        start: vi.fn(),
        stop: vi.fn(),
        ondataavailable: null as ((event: { data: Blob }) => void) | null,
        onstop: null as (() => void) | null,
        state: "recording" as const,
      };
      mockMediaRecorder.mockImplementation(() => mockRecorderInstance);

      const { result } = renderHook(() => useWebcam());

      await act(async () => {
        await result.current.startCamera();
      });

      act(() => {
        result.current.startRecording();
      });

      act(() => {
        if (mockRecorderInstance.ondataavailable) {
          mockRecorderInstance.ondataavailable({ data: new Blob(["test"]) });
        }
      });

      expect(result.current.recordedChunks.length).toBe(1);
    });
  });
});
