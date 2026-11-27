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

  it("shows the install hint when no speech engine is set up", () => {
    setup({
      provider: "No speech engine",
      hint: "Install whisper (see README, Transcription setup) or set OPENAI_API_KEY.",
    });

    const line = screen.getByTestId("provider-line").textContent ?? "";
    expect(line).toContain("No speech engine");
    expect(line).toContain("Install whisper");
    expect(line).not.toContain("Audio stays on this machine.");
  });

  it("opens the batch dialog", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Transcribe Several Projects" }));

    expect(props.onTranscribeSeveral).toHaveBeenCalledTimes(1);
  });

  it("opens a confirm on the first Transcribe Again click when the transcript has edits", () => {
    const props = setup({ state: { kind: "transcribed", words: 81 }, hasEdits: true });

    fireEvent.click(screen.getByRole("button", { name: "Transcribe Again" }));

    expect(props.onTranscribe).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Confirm transcribing again" })).toBeTruthy();
    expect(
      screen.getByText("Transcribing again replaces your edits to this transcript."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace Transcript" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("replaces the transcript on confirmation", () => {
    const props = setup({ state: { kind: "transcribed", words: 81 }, hasEdits: true });

    fireEvent.click(screen.getByRole("button", { name: "Transcribe Again" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace Transcript" }));

    expect(props.onTranscribe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "Confirm transcribing again" })).toBeNull();
  });

  it("leaves the transcript alone on Cancel", () => {
    const props = setup({ state: { kind: "transcribed", words: 81 }, hasEdits: true });

    fireEvent.click(screen.getByRole("button", { name: "Transcribe Again" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onTranscribe).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Confirm transcribing again" })).toBeNull();
  });

  it("moves focus to Cancel and returns it on Escape", () => {
    const props = setup({ state: { kind: "transcribed", words: 81 }, hasEdits: true });
    const trigger = screen.getByRole("button", { name: "Transcribe Again" }) as HTMLButtonElement;

    fireEvent.click(trigger);
    const cancel = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(cancel, { key: "Escape" });

    expect(props.onTranscribe).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Confirm transcribing again" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("transcribes at once when the transcript has no edits", () => {
    const props = setup({ state: { kind: "transcribed", words: 81 } });

    fireEvent.click(screen.getByRole("button", { name: "Transcribe Again" }));

    expect(props.onTranscribe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "Confirm transcribing again" })).toBeNull();
  });
});
