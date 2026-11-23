// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IngestInspector, type IngestInspectorProps } from "./IngestInspector";

afterEach(cleanup);

const probe = {
  durationSeconds: 62,
  sizeBytes: 2 * 1024 * 1024,
  videoCodec: "h264",
  width: 1280,
  height: 720,
  frameRate: 30,
  audioCodec: "aac",
  channels: 2,
  sampleRate: 48000,
};

function setup(overrides: Partial<IngestInspectorProps> = {}) {
  const props: IngestInspectorProps = {
    probe,
    probeError: null,
    hasMedia: true,
    hasTranscript: false,
    transcribing: false,
    onOpenInEdit: vi.fn(),
    ...overrides,
  };

  render(<IngestInspector {...props} />);
  return props;
}

describe("IngestInspector", () => {
  it("shows media details from an injected probe", () => {
    setup();

    expect(screen.getByText("h264")).toBeTruthy();
    expect(screen.getByText("1280×720")).toBeTruthy();
    expect(screen.getByText("30 fps")).toBeTruthy();
    expect(screen.getByText("aac · 2 ch · 48000 Hz")).toBeTruthy();
    expect(screen.getByText("1:02")).toBeTruthy();
    expect(screen.getByText("2.0 MB")).toBeTruthy();
  });

  it("marks the next steps done or pending", () => {
    setup({ hasMedia: true, hasTranscript: false });

    const steps = screen.getByRole("list", { name: "Next Steps" }).querySelectorAll("li");
    expect([...steps].map((step) => step.textContent)).toEqual([
      "ImportDone",
      "TranscribePending",
      "Open in EditPending",
    ]);
  });

  it("only opens Edit once a transcript exists", () => {
    const pending = setup({ hasMedia: true, hasTranscript: false });
    const pendingButton = screen.getByRole("button", {
      name: "Open in Edit",
    }) as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);

    cleanup();
    const ready = setup({ hasMedia: true, hasTranscript: true });
    fireEvent.click(screen.getByRole("button", { name: "Open in Edit" }));
    expect(ready.onOpenInEdit).toHaveBeenCalledTimes(1);
    expect(pending.onOpenInEdit).not.toHaveBeenCalled();
  });

  it("shows the import step pending when there is no media", () => {
    setup({ probe: null, hasMedia: false, hasTranscript: false });

    expect(screen.getByText("No media imported yet.")).toBeTruthy();
    const steps = screen.getByRole("list", { name: "Next Steps" }).querySelectorAll("li");
    expect([...steps].map((step) => step.textContent)).toEqual([
      "ImportPending",
      "TranscribePending",
      "Open in EditPending",
    ]);
  });

  it("shows a probe error", () => {
    setup({ probe: null, probeError: "ffprobe failed" });

    expect(screen.getByRole("alert").textContent).toContain("ffprobe failed");
  });
});
