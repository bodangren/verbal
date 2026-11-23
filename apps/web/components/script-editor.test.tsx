// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScriptEditor, type ScriptEditorProps } from "./ScriptEditor";

afterEach(cleanup);

function setup(overrides: Partial<ScriptEditorProps> = {}) {
  const props: ScriptEditorProps = {
    script: "First line.",
    words: 2,
    readTime: "0:01",
    onScriptChange: vi.fn(),
    onUseTranscript: vi.fn(),
    onOpenStudio: vi.fn(),
    ...overrides,
  };

  render(<ScriptEditor {...props} />);
  return props;
}

describe("ScriptEditor", () => {
  it("edits the script and offers Use Transcript and Open Studio", () => {
    const props = setup();

    const editor = screen.getByRole("textbox", { name: "Script" }) as HTMLTextAreaElement;
    expect(editor.value).toBe("First line.");

    fireEvent.change(editor, { target: { value: "New." } });
    expect(props.onScriptChange).toHaveBeenCalledWith("New.");

    fireEvent.click(screen.getByRole("button", { name: "Use Transcript" }));
    expect(props.onUseTranscript).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Open Studio" }));
    expect(props.onOpenStudio).toHaveBeenCalledTimes(1);
  });

  it("shows the word count and read time", () => {
    setup({ words: 2, readTime: "0:01" });

    expect(screen.getByText("2 words")).toBeTruthy();
    expect(screen.getByText("0:01 read")).toBeTruthy();
  });
});
