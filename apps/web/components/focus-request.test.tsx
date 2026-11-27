// @vitest-environment jsdom
// The `focusRequest` prop moves the caret to a word without the freeze that
// `caretIndex` imposes: the caret follows a changed token once, and the arrow
// keys keep working afterwards.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createTranscript, type SpokenWord } from "@verbal/core/browser";
import { afterEach, describe, expect, it } from "vitest";
import { TranscriptEditor } from "./TranscriptEditor";

const words: SpokenWord[] = [
  { text: "one", start: 0, end: 0.4 },
  { text: "two", start: 0.5, end: 0.9 },
  { text: "three", start: 1.0, end: 1.4 },
  { text: "four", start: 1.5, end: 1.9 },
  { text: "five", start: 2.0, end: 2.4 },
  { text: "six", start: 2.5, end: 2.9 },
];

const transcript = createTranscript(words);

function activeDescendant(): string | null {
  return screen.getByRole("listbox", { name: /transcript/i }).getAttribute("aria-activedescendant");
}

afterEach(cleanup);

describe("focusRequest", () => {
  it("moves the caret to the requested index when the token changes", () => {
    const view = render(<TranscriptEditor transcript={transcript} />);
    expect(activeDescendant()).toBe("transcript-word-w0");

    view.rerender(
      <TranscriptEditor transcript={transcript} focusRequest={{ index: 3, token: 1 }} />,
    );
    expect(activeDescendant()).toBe("transcript-word-w3");
  });

  it("keeps arrow keys working after a focus request", () => {
    const view = render(<TranscriptEditor transcript={transcript} />);
    view.rerender(
      <TranscriptEditor transcript={transcript} focusRequest={{ index: 3, token: 1 }} />,
    );
    expect(activeDescendant()).toBe("transcript-word-w3");

    const box = screen.getByRole("listbox", { name: /transcript/i });
    box.focus();
    fireEvent.keyDown(box, { key: "ArrowRight" });
    expect(activeDescendant()).toBe("transcript-word-w4");
  });

  it("does not move the caret again when the token is unchanged", () => {
    const view = render(<TranscriptEditor transcript={transcript} />);
    view.rerender(
      <TranscriptEditor transcript={transcript} focusRequest={{ index: 3, token: 1 }} />,
    );
    expect(activeDescendant()).toBe("transcript-word-w3");

    const box = screen.getByRole("listbox", { name: /transcript/i });
    box.focus();
    fireEvent.keyDown(box, { key: "ArrowRight" });
    expect(activeDescendant()).toBe("transcript-word-w4");

    view.rerender(
      <TranscriptEditor transcript={transcript} focusRequest={{ index: 3, token: 1 }} />,
    );
    expect(activeDescendant()).toBe("transcript-word-w4");
  });
});
