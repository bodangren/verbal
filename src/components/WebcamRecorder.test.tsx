import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WebcamRecorder } from "./WebcamRecorder";

vi.mock("../hooks/useWebcam", () => ({
  useWebcam: vi.fn(() => ({
    stream: null,
    isRecording: false,
    recordedChunks: [],
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(() => null),
  })),
}));

import { useWebcam } from "../hooks/useWebcam";

const mockUseWebcam = vi.mocked(useWebcam);

const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject");

describe("WebcamRecorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      set: vi.fn(),
      get: vi.fn(() => null),
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(HTMLMediaElement.prototype, "srcObject", originalDescriptor);
    }
  });

  it("renders start camera button initially", () => {
    render(<WebcamRecorder />);
    expect(screen.getByRole("button", { name: /start camera/i })).toBeDefined();
  });

  it("calls startCamera when Start Camera button is clicked", async () => {
    const mockStartCamera = vi.fn();
    mockUseWebcam.mockReturnValue({
      stream: null,
      isRecording: false,
      recordedChunks: [],
      startCamera: mockStartCamera,
      stopCamera: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: vi.fn(() => null),
    });

    render(<WebcamRecorder />);
    fireEvent.click(screen.getByRole("button", { name: /start camera/i }));

    expect(mockStartCamera).toHaveBeenCalled();
  });

  it("shows video preview when stream is available", () => {
    const mockStream = {} as MediaStream;
    mockUseWebcam.mockReturnValue({
      stream: mockStream,
      isRecording: false,
      recordedChunks: [],
      startCamera: vi.fn(),
      stopCamera: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: vi.fn(() => null),
    });

    render(<WebcamRecorder />);
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("shows recording indicator when recording", () => {
    const mockStream = {} as MediaStream;
    mockUseWebcam.mockReturnValue({
      stream: mockStream,
      isRecording: true,
      recordedChunks: [],
      startCamera: vi.fn(),
      stopCamera: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: vi.fn(() => null),
    });

    render(<WebcamRecorder />);
    expect(screen.getByText("Recording")).toBeDefined();
  });

  it("shows record button when camera is active but not recording", () => {
    const mockStream = {} as MediaStream;
    mockUseWebcam.mockReturnValue({
      stream: mockStream,
      isRecording: false,
      recordedChunks: [],
      startCamera: vi.fn(),
      stopCamera: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: vi.fn(() => null),
    });

    render(<WebcamRecorder />);
    expect(screen.getByRole("button", { name: /record/i })).toBeDefined();
  });

  it("shows stop recording button when recording", () => {
    const mockStream = {} as MediaStream;
    mockUseWebcam.mockReturnValue({
      stream: mockStream,
      isRecording: true,
      recordedChunks: [],
      startCamera: vi.fn(),
      stopCamera: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: vi.fn(() => null),
    });

    render(<WebcamRecorder />);
    expect(screen.getByRole("button", { name: /stop recording/i })).toBeDefined();
  });

  it("calls startRecording when Record button is clicked", () => {
    const mockStream = {} as MediaStream;
    const mockStartRecording = vi.fn();
    mockUseWebcam.mockReturnValue({
      stream: mockStream,
      isRecording: false,
      recordedChunks: [],
      startCamera: vi.fn(),
      stopCamera: vi.fn(),
      startRecording: mockStartRecording,
      stopRecording: vi.fn(() => null),
    });

    render(<WebcamRecorder />);
    fireEvent.click(screen.getByRole("button", { name: /record/i }));

    expect(mockStartRecording).toHaveBeenCalled();
  });

  it("calls stopRecording when Stop button is clicked", () => {
    const mockStream = {} as MediaStream;
    const mockStopRecording = vi.fn(() => null);
    mockUseWebcam.mockReturnValue({
      stream: mockStream,
      isRecording: true,
      recordedChunks: [],
      startCamera: vi.fn(),
      stopCamera: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: mockStopRecording,
    });

    render(<WebcamRecorder />);
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    expect(mockStopRecording).toHaveBeenCalled();
  });
});
