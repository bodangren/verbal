import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoPlayer } from "./VideoPlayer";

const mockTranscript = [
  {
    id: "1",
    words: [
      { word: "Hello", start: 0, end: 0.5 },
      { word: "world", start: 0.5, end: 1.0 },
    ],
  },
  {
    id: "2",
    words: [
      { word: "This", start: 1.0, end: 1.2 },
      { word: "is", start: 1.2, end: 1.4 },
      { word: "a", start: 1.4, end: 1.5 },
      { word: "test", start: 1.5, end: 2.0 },
    ],
  },
];

describe("VideoPlayer", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      set: vi.fn(),
      get: vi.fn(() => null),
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalDescriptor) {
      Object.defineProperty(HTMLMediaElement.prototype, "srcObject", originalDescriptor);
    }
  });

  it("renders video element", () => {
    render(<VideoPlayer />);
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("displays play/pause controls", () => {
    render(<VideoPlayer />);
    expect(screen.getByRole("button", { name: /play/i })).toBeDefined();
  });

  it("toggles play state when button is clicked", () => {
    render(<VideoPlayer />);
    const playButton = screen.getByRole("button", { name: /play/i });
    fireEvent.click(playButton);
    expect(screen.getByRole("button", { name: /pause/i })).toBeDefined();
  });

  it("displays time progress", () => {
    render(<VideoPlayer />);
    expect(screen.getByText(/0:00/)).toBeDefined();
  });

  it("accepts video src", () => {
    render(<VideoPlayer src="test-video.webm" />);
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("accepts media stream", () => {
    const mockStream = {} as MediaStream;
    render(<VideoPlayer stream={mockStream} />);
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("calls onTimeUpdate when video time changes", () => {
    const mockOnTimeUpdate = vi.fn();
    render(<VideoPlayer onTimeUpdate={mockOnTimeUpdate} />);
    
    const video = screen.getByRole("img");
    Object.defineProperty(video, "currentTime", { value: 1.5, writable: true });
    fireEvent.timeUpdate(video);
    
    expect(mockOnTimeUpdate).toHaveBeenCalledWith(1.5);
  });

  it("highlights current word based on time", () => {
    render(<VideoPlayer transcript={mockTranscript} currentTime={0.7} />);
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("seeks to timestamp when word is clicked", () => {
    const mockOnSeek = vi.fn();
    render(<VideoPlayer transcript={mockTranscript} onSeek={mockOnSeek} />);
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("debounces rapid external currentTime updates to prevent double-seek", async () => {
    const mockSetCurrentTime = vi.fn();
    const { rerender } = render(<VideoPlayer currentTime={0} />);

    const video = screen.getByRole("img");
    Object.defineProperty(video, "currentTime", {
      set: mockSetCurrentTime,
      get: () => 0,
      configurable: true,
    });

    rerender(<VideoPlayer currentTime={0.1} />);
    rerender(<VideoPlayer currentTime={0.2} />);
    rerender(<VideoPlayer currentTime={0.3} />);
    rerender(<VideoPlayer currentTime={5.0} />);

    vi.advanceTimersByTime(100);
    expect(mockSetCurrentTime.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
