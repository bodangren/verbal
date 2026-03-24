import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WebcamRecorder } from "./WebcamRecorder";

vi.mock("../hooks/useWebcam", () => ({
  useWebcam: vi.fn(),
}));

import { useWebcam } from "../hooks/useWebcam";

const mockUseWebcam = vi.mocked(useWebcam);

function createMockReturn(overrides: Partial<ReturnType<typeof useWebcam>> = {}) {
  return {
    isActive: false,
    isRecording: false,
    error: null as string | null,
    availableDevices: [],
    selectedDeviceId: null as string | null,
    canvasRef: { current: null },
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
    startRecording: vi.fn().mockResolvedValue(undefined),
    stopRecording: vi.fn().mockResolvedValue(null),
    clearError: vi.fn(),
    enumerateDevices: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("WebcamRecorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWebcam.mockReturnValue(createMockReturn());
  });

  it("renders start camera button initially", () => {
    render(<WebcamRecorder />);
    expect(screen.getByRole("button", { name: /start camera/i })).toBeDefined();
  });

  it("calls startCamera when Start Camera button is clicked", async () => {
    const mockStartCamera = vi.fn();
    mockUseWebcam.mockReturnValue(createMockReturn({ startCamera: mockStartCamera }));

    render(<WebcamRecorder />);
    fireEvent.click(screen.getByRole("button", { name: /start camera/i }));

    expect(mockStartCamera).toHaveBeenCalled();
  });

  it("shows canvas preview when camera is active", () => {
    mockUseWebcam.mockReturnValue(createMockReturn({ isActive: true }));

    render(<WebcamRecorder />);
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("shows recording indicator when recording", () => {
    mockUseWebcam.mockReturnValue(createMockReturn({ isActive: true, isRecording: true }));

    render(<WebcamRecorder />);
    expect(screen.getByText("Recording")).toBeDefined();
  });

  it("shows record button when camera is active but not recording", () => {
    mockUseWebcam.mockReturnValue(createMockReturn({ isActive: true }));

    render(<WebcamRecorder />);
    expect(screen.getByRole("button", { name: /record/i })).toBeDefined();
  });

  it("shows stop recording button when recording", () => {
    mockUseWebcam.mockReturnValue(createMockReturn({ isActive: true, isRecording: true }));

    render(<WebcamRecorder />);
    expect(screen.getByRole("button", { name: /stop recording/i })).toBeDefined();
  });

  it("calls startRecording when Record button is clicked", () => {
    const mockStartRecording = vi.fn().mockResolvedValue(undefined);
    mockUseWebcam.mockReturnValue(createMockReturn({ isActive: true, startRecording: mockStartRecording }));

    render(<WebcamRecorder />);
    fireEvent.click(screen.getByRole("button", { name: /record/i }));

    expect(mockStartRecording).toHaveBeenCalled();
  });

  it("calls stopRecording when Stop button is clicked", () => {
    const mockStopRecording = vi.fn().mockResolvedValue(null);
    mockUseWebcam.mockReturnValue(createMockReturn({ isActive: true, isRecording: true, stopRecording: mockStopRecording }));

    render(<WebcamRecorder />);
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    expect(mockStopRecording).toHaveBeenCalled();
  });

  it("displays error message when camera access fails", () => {
    mockUseWebcam.mockReturnValue(createMockReturn({ error: "Failed to start camera: No permission" }));

    render(<WebcamRecorder />);
    expect(screen.getByText("Camera Error")).toBeDefined();
    expect(screen.getByText("Failed to start camera: No permission")).toBeDefined();
  });

  it("calls clearError when dismiss error button is clicked", () => {
    const mockClearError = vi.fn();
    mockUseWebcam.mockReturnValue(createMockReturn({ error: "Some error", clearError: mockClearError }));

    render(<WebcamRecorder />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss error/i }));

    expect(mockClearError).toHaveBeenCalled();
  });

  it("shows camera selection dropdown when multiple cameras are available", () => {
    mockUseWebcam.mockReturnValue(createMockReturn({
      availableDevices: [
        { id: "cam1", name: "Camera 1", description: "Built-in", is_available: true },
        { id: "cam2", name: "Camera 2", description: "External", is_available: true },
      ],
    }));

    render(<WebcamRecorder />);
    expect(screen.getByRole("combobox", { name: /select camera/i })).toBeDefined();
  });

  it("does not show camera selection dropdown when only one camera is available", () => {
    mockUseWebcam.mockReturnValue(createMockReturn({
      availableDevices: [
        { id: "cam1", name: "Camera 1", description: "Built-in", is_available: true },
      ],
    }));

    render(<WebcamRecorder />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
