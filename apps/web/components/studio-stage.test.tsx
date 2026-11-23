// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioStage, type StudioStageProps } from "./StudioStage";

afterEach(cleanup);

function setup(overrides: Partial<StudioStageProps> = {}) {
  const props: StudioStageProps = {
    script: "First line.\nSecond line.",
    words: 4,
    readTime: "0:02",
    offsetWords: 0,
    wpm: 150,
    fontSize: 40,
    mirror: false,
    playing: false,
    onScriptChange: vi.fn(),
    onUseTranscript: vi.fn(),
    onTogglePlay: vi.fn(),
    onWpmChange: vi.fn(),
    onFontSizeChange: vi.fn(),
    onToggleMirror: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };

  render(<StudioStage {...props} />);
  return props;
}

describe("StudioStage", () => {
  it("edits the script and offers Use Transcript", () => {
    const props = setup();

    const editor = screen.getByRole("textbox", { name: "Script" });
    expect((editor as HTMLTextAreaElement).value).toBe("First line.\nSecond line.");

    fireEvent.change(editor, { target: { value: "New script." } });
    expect(props.onScriptChange).toHaveBeenCalledWith("New script.");

    fireEvent.click(screen.getByRole("button", { name: "Use Transcript" }));
    expect(props.onUseTranscript).toHaveBeenCalledTimes(1);
  });

  it("shows the word count and read time", () => {
    setup({ words: 4, readTime: "0:02" });

    expect(screen.getByText("4 words")).toBeTruthy();
    expect(screen.getByText("0:02 read")).toBeTruthy();
  });

  it("hosts the prompter", () => {
    setup();

    expect(screen.getByRole("region", { name: "Teleprompter" })).toBeTruthy();
  });
});
