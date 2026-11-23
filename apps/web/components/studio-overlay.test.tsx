// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioOverlay, type StudioOverlayProps } from "./StudioOverlay";

afterEach(cleanup);

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
    previewing: true,
    cameraAvailable: true,
    keyQuality: null,
    recording: false,
    durationSeconds: 10,
    onClose: vi.fn(),
    onScriptChange: vi.fn(),
    onUseTranscript: vi.fn(),
    onTogglePlay: vi.fn(),
    onWpmChange: vi.fn(),
    onFontSizeChange: vi.fn(),
    onToggleMirror: vi.fn(),
    onReset: vi.fn(),
    onStartPreview: vi.fn(),
    onStopPreview: vi.fn(),
    onDurationChange: vi.fn(),
    onRecord: vi.fn(),
    onStopRecording: vi.fn(),
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
    const props = setup({ previewing: false });

    expect(screen.getByText("Camera preview is off")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start Camera" }));
    expect(props.onStartPreview).toHaveBeenCalledTimes(1);
  });
});
