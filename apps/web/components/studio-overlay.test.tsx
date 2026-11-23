// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StudioOverlay,
  type StudioCapture,
  type StudioOverlayProps,
} from "./StudioOverlay";

afterEach(cleanup);

function capture(overrides: Partial<StudioCapture> = {}): StudioCapture {
  return {
    state: "idle",
    countdown: null,
    elapsedSeconds: 0,
    cameraAvailable: true,
    previewing: true,
    cameras: [{ deviceId: "cam-1", label: "Face Camera" }],
    microphones: [{ deviceId: "mic-1", label: "USB Mic" }],
    cameraId: null,
    microphoneId: null,
    takes: [],
    onStart: vi.fn(),
    onStop: vi.fn(),
    onStartPreview: vi.fn(),
    onCameraChange: vi.fn(),
    onMicrophoneChange: vi.fn(),
    ...overrides,
  };
}

function setup(overrides: Partial<StudioOverlayProps> = {}) {
  const props: StudioOverlayProps = {
    projectName: "Alpha",
    script: "First line.\nSecond line.",
    words: 4,
    readTime: "0:02",
    offsetWords: 0,
    wpm: 150,
    fontSize: 40,
    mirror: false,
    playing: false,
    videoRef: { current: null },
    capture: capture(),
    onClose: vi.fn(),
    onScriptChange: vi.fn(),
    onUseTranscript: vi.fn(),
    onTogglePlay: vi.fn(),
    onWpmChange: vi.fn(),
    onFontSizeChange: vi.fn(),
    onToggleMirror: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };

  render(<StudioOverlay {...props} />);
  return props;
}

describe("StudioOverlay", () => {
  it("is one full-screen dialog with the camera and prompter", () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Studio" })).toBeTruthy();
    expect(screen.getByTestId("studio-video")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Teleprompter" })).toBeTruthy();
    expect(screen.getByText("First line.")).toBeTruthy();
  });

  it("closes from the bar and Escape", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("opens the script panel on demand", () => {
    const props = setup();

    expect(screen.queryByRole("textbox", { name: "Script" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Script" }));

    const editor = screen.getByRole("textbox", { name: "Script" });
    fireEvent.change(editor, { target: { value: "New script." } });
    expect(props.onScriptChange).toHaveBeenCalledWith("New script.");

    fireEvent.click(screen.getByRole("button", { name: "Use Transcript" }));
    expect(props.onUseTranscript).toHaveBeenCalledTimes(1);
  });

  it("opens the script panel for an empty script", () => {
    setup({ script: "" });

    expect(screen.getByRole("textbox", { name: "Script" })).toBeTruthy();
  });

  it("offers Start Camera when the preview is off", () => {
    const props = setup({ capture: capture({ previewing: false }) });

    expect(screen.getByText("Camera preview is off")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start Camera" }));
    expect(props.capture.onStartPreview).toHaveBeenCalledTimes(1);
  });

  it("records and stops", () => {
    const idle = setup();
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(idle.capture.onStart).toHaveBeenCalledTimes(1);

    cleanup();
    const recording = setup({ capture: capture({ state: "recording", elapsedSeconds: 5 }) });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(recording.capture.onStop).toHaveBeenCalledTimes(1);
    expect(screen.getByText("0:05")).toBeTruthy();
  });

  it("shows the countdown and disables Record while busy", () => {
    setup({ capture: capture({ state: "countdown", countdown: 2 }) });

    expect(screen.getByRole("status").textContent).toBe("2");
    const button = screen.getByRole("button", { name: "Record" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("changes devices and lists takes", () => {
    const props = setup({
      capture: capture({
        takes: [
          {
            id: "take-1",
            fileName: "take-1.mp4",
            createdAt: "2026-11-23T10:00:00.000Z",
            durationSeconds: 65,
          },
        ],
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Script" }));
    fireEvent.change(screen.getByLabelText("Camera"), { target: { value: "cam-1" } });
    expect(props.capture.onCameraChange).toHaveBeenCalledWith("cam-1");

    expect(screen.getByText("take-1.mp4")).toBeTruthy();
    expect(screen.getByText("1:05")).toBeTruthy();
  });
});
