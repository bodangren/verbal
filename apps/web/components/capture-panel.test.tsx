// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyQuality } from "@verbal/media/key-quality";
import { CapturePanel } from "./CapturePanel";

afterEach(cleanup);

const QUALITY: KeyQuality = {
  level: "warning",
  message: "Uneven lighting or spill on the background",
  greenDominance: 0.4,
  uniformity: 0.3,
};

function renderPanel(overrides: Partial<Parameters<typeof CapturePanel>[0]> = {}) {
  const props = {
    cameraAvailable: true,
    keyQuality: QUALITY,
    previewing: false,
    recording: false,
    durationSeconds: 10,
    onStartPreview: vi.fn(),
    onStopPreview: vi.fn(),
    onDurationChange: vi.fn(),
    onRecord: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  render(<CapturePanel {...props} />);
  return props;
}

describe("CapturePanel", () => {
  it("shows the key-quality warning", () => {
    renderPanel();

    expect(screen.getByRole("region", { name: /capture/i })).toBeTruthy();
    const message = screen.getByText(/uneven lighting/i);
    expect(message.getAttribute("data-level")).toBe("warning");
  });

  it("warns when no camera is available", () => {
    renderPanel({ cameraAvailable: false });

    expect(screen.getByText(/no camera/i)).toBeTruthy();
  });

  it("starts the preview", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /start preview/i }));

    expect(props.onStartPreview).toHaveBeenCalledTimes(1);
  });

  it("stops the preview while previewing", () => {
    const props = renderPanel({ previewing: true });

    fireEvent.click(screen.getByRole("button", { name: /stop preview/i }));

    expect(props.onStopPreview).toHaveBeenCalledTimes(1);
  });

  it("changes the recording duration", () => {
    const props = renderPanel();

    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: "15" } });

    expect(props.onDurationChange).toHaveBeenCalledWith(15);
  });

  it("records", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /^record/i }));

    expect(props.onRecord).toHaveBeenCalledTimes(1);
  });

  it("stops recording while recording", () => {
    const props = renderPanel({ recording: true });

    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    expect(props.onStop).toHaveBeenCalledTimes(1);
  });

  it("disables recording without a camera", () => {
    renderPanel({ cameraAvailable: false });

    expect(screen.getByRole("button", { name: /^record/i }).hasAttribute("disabled")).toBe(true);
  });
});
