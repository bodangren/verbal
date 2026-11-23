// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IngestStage, type IngestStageProps } from "./IngestStage";

afterEach(cleanup);

function setup(overrides: Partial<IngestStageProps> = {}) {
  const props: IngestStageProps = {
    projectName: "Alpha",
    mediaName: "take.mp4",
    state: { kind: "untranscribed" },
    provider: "Cloud (OpenAI-compatible)",
    cloud: true,
    onImport: vi.fn(),
    onRecord: vi.fn(),
    onTranscribe: vi.fn(),
    onRetry: vi.fn(),
    onTranscribeSeveral: vi.fn(),
    ...overrides,
  };

  render(<IngestStage {...props} />);
  return props;
}

describe("IngestStage", () => {
  it("puts import and record in one card", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Import Media" }));
    fireEvent.click(screen.getByRole("button", { name: "Record" }));

    expect(props.onImport).toHaveBeenCalledTimes(1);
    expect(props.onRecord).toHaveBeenCalledTimes(1);
  });

  it("shows a Not Transcribed row and starts transcription", () => {
    const props = setup({ state: { kind: "untranscribed" } });

    expect(screen.getByText("Not Transcribed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));

    expect(props.onTranscribe).toHaveBeenCalledTimes(1);
  });

  it("shows progress while transcribing", () => {
    setup({ state: { kind: "transcribing", progress: 0.4 } });

    expect(screen.getByText("Transcribing… 40%")).toBeTruthy();
    const button = screen.getByRole("button", {
      name: "Transcribing…",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("shows the word count when transcribed", () => {
    setup({ state: { kind: "transcribed", words: 81 } });

    expect(screen.getByText("Transcribed 81 words")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Transcribe Again" })).toBeTruthy();
  });

  it("offers Retry after a failure", () => {
    const props = setup({ state: { kind: "failed", detail: "provider exploded" } });

    expect(screen.getByText("Failed: provider exploded")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("names the provider and warns when audio leaves the machine", () => {
    setup();

    expect(screen.getByTestId("provider-line").textContent).toContain(
      "Cloud (OpenAI-compatible)",
    );
    expect(screen.getByTestId("provider-line").textContent).toContain(
      "Audio leaves this machine.",
    );
  });

  it("opens the batch dialog", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Transcribe Several Projects" }));

    expect(props.onTranscribeSeveral).toHaveBeenCalledTimes(1);
  });
});
