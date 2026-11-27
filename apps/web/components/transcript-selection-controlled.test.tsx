// @vitest-environment jsdom
// Keyboard range selection through a controlled parent, exactly as the page
// wires it: the parent stores what `onSelectionChange` reports and passes it
// back as `selectedRange`. The anchor must survive that echo, so Shift+Arrow
// keeps extending instead of restarting at the caret.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTranscript,
  removeRange,
  restoreRange,
  type SpokenWord,
  type TranscriptDocument,
} from "@verbal/core/browser";
import { TranscriptEditor, type WordSelection } from "./TranscriptEditor";

const css = readFileSync(join(__dirname, "..", "styles", "globals.css"), "utf8");

const words: SpokenWord[] = [
  { text: "one", start: 0, end: 0.4 },
  { text: "two", start: 0.5, end: 0.9 },
  { text: "three", start: 1.0, end: 1.4 },
  { text: "four", start: 1.5, end: 1.9 },
  { text: "five", start: 2.0, end: 2.4 },
  { text: "six", start: 2.5, end: 2.9 },
];

const transcript = createTranscript(words);

function selectedTexts(): string[] {
  return screen
    .getAllByRole("option")
    .filter((option) => option.getAttribute("aria-selected") === "true")
    .map((option) => option.textContent ?? "");
}

function wordRemoved(id: string): boolean {
  const option = Array.from(document.querySelectorAll<HTMLElement>("[data-word-id]")).find(
    (el) => el.dataset.wordId === id,
  );
  return option?.dataset.removed === "true";
}

/** The page's wiring: the parent owns the selection and echoes it back. */
function ControlledParent({
  transcript: doc,
  onDeleteSelection,
  onRestore,
  onSelectionClear,
}: {
  transcript: TranscriptDocument;
  onDeleteSelection?: () => void;
  onRestore?: (fromIndex: number, toIndex: number) => void;
  onSelectionClear?: () => void;
}) {
  const [selection, setSelection] = useState<WordSelection | null>(null);
  return (
    <TranscriptEditor
      transcript={doc}
      selectedRange={selection}
      onSelectionChange={setSelection}
      onSelectionClear={() => {
        setSelection(null);
        onSelectionClear?.();
      }}
      onWordClick={(_wordId, index) => setSelection({ fromIndex: index, toIndex: index })}
      onDeleteSelection={onDeleteSelection}
      onRestore={onRestore}
    />
  );
}

/** The page's edit wiring: the parent applies removals and restores. */
function ControlledTranscript({ words: spoken }: { words: SpokenWord[] }) {
  const [doc, setDoc] = useState(() => createTranscript(spoken));
  const [selection, setSelection] = useState<WordSelection | null>(null);
  return (
    <TranscriptEditor
      transcript={doc}
      selectedRange={selection}
      onSelectionChange={setSelection}
      onSelectionClear={() => setSelection(null)}
      onWordClick={(_wordId, index) => setSelection({ fromIndex: index, toIndex: index })}
      onDeleteSelection={() => {
        if (selection !== null) {
          setDoc((current) => removeRange(current, selection.fromIndex, selection.toIndex));
          setSelection(null);
        }
      }}
      onRestore={(fromIndex, toIndex) => {
        setDoc((current) => restoreRange(current, fromIndex, toIndex));
      }}
    />
  );
}

afterEach(cleanup);

describe("keyboard range selection through a controlled parent", () => {
  it("extends from Home, shrinks, collapses past the anchor, and re-extends", () => {
    render(<ControlledParent transcript={transcript} />);
    const box = screen.getByRole("listbox", { name: /transcript/i });
    box.focus();

    fireEvent.keyDown(box, { key: "Home" });
    for (let i = 0; i < 5; i += 1) {
      fireEvent.keyDown(box, { key: "ArrowRight", shiftKey: true });
    }
    expect(selectedTexts()).toEqual(["one", "two", "three", "four", "five", "six"]);

    for (let i = 0; i < 4; i += 1) {
      fireEvent.keyDown(box, { key: "ArrowLeft", shiftKey: true });
    }
    expect(selectedTexts()).toEqual(["one", "two"]);

    // Passing the anchor collapses the range; moving back re-extends from it.
    fireEvent.keyDown(box, { key: "ArrowLeft", shiftKey: true });
    expect(selectedTexts()).toEqual([]);
    fireEvent.keyDown(box, { key: "ArrowRight", shiftKey: true });
    expect(selectedTexts()).toEqual(["one", "two"]);
  });

  it("deletes the keyboard-built range and restores it with Space", () => {
    render(<ControlledTranscript words={words} />);
    const box = screen.getByRole("listbox", { name: /transcript/i });
    box.focus();

    fireEvent.keyDown(box, { key: "Home" });
    fireEvent.keyDown(box, { key: "ArrowRight", shiftKey: true });
    expect(selectedTexts()).toEqual(["one", "two"]);

    fireEvent.keyDown(box, { key: "Delete" });
    expect(wordRemoved("w0")).toBe(true);
    expect(wordRemoved("w1")).toBe(true);
    expect(selectedTexts()).toEqual([]);

    fireEvent.keyDown(box, { key: "Home" });
    fireEvent.keyDown(box, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(box, { key: " " });
    expect(wordRemoved("w0")).toBe(false);
    expect(wordRemoved("w1")).toBe(false);
  });
});

describe("parent-set selection scroll", () => {
  let original: typeof Element.prototype.scrollIntoView;

  beforeEach(() => {
    original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  it("scrolls the match word into view when the parent sets the selection", () => {
    const view = render(<TranscriptEditor transcript={transcript} />);

    view.rerender(
      <TranscriptEditor transcript={transcript} selectedRange={{ fromIndex: 3, toIndex: 3 }} />,
    );

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    const matchWord = document.getElementById("transcript-word-w3");
    expect((Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.instances).toContain(
      matchWord,
    );
  });
});

describe("plain caret move after a click", () => {
  it("clears the page selection through onSelectionClear", () => {
    const onSelectionClear = vi.fn();
    render(<ControlledParent transcript={transcript} onSelectionClear={onSelectionClear} />);
    const box = screen.getByRole("listbox", { name: /transcript/i });
    box.focus();

    fireEvent.click(screen.getByRole("option", { name: "two" }));
    expect(screen.getByRole("option", { name: "two" }).getAttribute("data-selected")).toBe("true");

    fireEvent.keyDown(box, { key: "ArrowRight" });
    expect(onSelectionClear).toHaveBeenCalledTimes(1);
    expect(selectedTexts()).toEqual([]);
  });
});

describe("caret and silence styling", () => {
  it("gates the caret outline behind listbox focus", () => {
    const rule = css.match(/[^{}]*\[data-caret="true"\][^{}]*\{[^}]*\}/);
    expect(rule?.[0]).toContain(":focus-within");
  });

  it("keeps the caret outline inside the word", () => {
    const rule = css.match(/[^{}]*\[data-caret="true"\][^{}]*\{[^}]*\}/);
    expect(rule?.[0]).toContain("outline-offset: -2px");
  });

  it("centres the silence chip on the word line", () => {
    const rule = css.match(/\.transcript__silence\s*\{[^}]*\}/);
    expect(rule?.[0]).toContain("align-self: center");
  });
});
