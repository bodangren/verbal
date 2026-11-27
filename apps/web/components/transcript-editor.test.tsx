// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranscript, removeWord } from "@verbal/core/browser";
import { TranscriptEditor } from "./TranscriptEditor";

afterEach(cleanup);

const transcript = createTranscript([
  { text: "hello", start: 0, end: 0.4 },
  { text: "world", start: 0.45, end: 0.9 },
  { text: "again", start: 1.8, end: 2.2 },
]);

describe("TranscriptEditor", () => {
  it("renders one tabbable listbox and non-focusable options", () => {
    render(<TranscriptEditor transcript={transcript} />);

    const listbox = screen.getByRole("listbox", { name: /transcript/i });
    const tabbable = listbox.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );
    expect(tabbable.length).toBe(0);
    expect(listbox.tabIndex).toBe(0);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "hello",
      "world",
      "again",
    ]);
  });

  it("reports the word id and index when a word is activated", () => {
    const onWordClick = vi.fn();
    render(<TranscriptEditor transcript={transcript} onWordClick={onWordClick} />);

    fireEvent.click(screen.getByRole("option", { name: "world" }));

    expect(onWordClick).toHaveBeenCalledWith("w1", 1);
  });

  it("reports a selection when a second word is shift-clicked", () => {
    const onSelectionChange = vi.fn();
    render(<TranscriptEditor transcript={transcript} onSelectionChange={onSelectionChange} />);

    fireEvent.click(screen.getByRole("option", { name: "hello" }));
    fireEvent.click(screen.getByRole("option", { name: "again" }), { shiftKey: true });

    expect(onSelectionChange).toHaveBeenCalledWith({ fromIndex: 0, toIndex: 2 }, [
      "w0",
      "w1",
      "w2",
    ]);
  });

  it("marks removed words as disabled with a data attribute", () => {
    const edited = removeWord(transcript, "w1");
    render(<TranscriptEditor transcript={edited} />);

    const option = screen.getByRole("option", { name: "world" });
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(option.getAttribute("data-removed")).toBe("true");
  });

  it("marks the active word with aria-current", () => {
    render(<TranscriptEditor transcript={transcript} activeWordId="w1" />);

    const button = screen.getByRole("option", { name: "world" });
    expect(button.getAttribute("aria-current")).toBe("true");
  });

  it("marks every word inside a search match with data-match", () => {
    render(
      <TranscriptEditor transcript={transcript} matchedRanges={[{ fromIndex: 0, toIndex: 1 }]} />,
    );

    expect(screen.getByRole("option", { name: "hello" }).getAttribute("data-match")).toBe("true");
    expect(screen.getByRole("option", { name: "world" }).getAttribute("data-match")).toBe("true");
    expect(screen.getByRole("option", { name: "again" }).hasAttribute("data-match")).toBe(false);
  });

  it("marks every word in the selected range with data-selected", () => {
    render(
      <TranscriptEditor transcript={transcript} selectedRange={{ fromIndex: 0, toIndex: 1 }} />,
    );

    expect(screen.getByRole("option", { name: "hello" }).getAttribute("data-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("option", { name: "world" }).getAttribute("data-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("option", { name: "again" }).hasAttribute("data-selected")).toBe(false);
  });

  it("deletes the selection when Delete is pressed on the focused region", () => {
    const onDeleteSelection = vi.fn();
    render(
      <TranscriptEditor
        transcript={transcript}
        selectedRange={{ fromIndex: 0, toIndex: 1 }}
        onDeleteSelection={onDeleteSelection}
      />,
    );

    const region = screen.getByRole("listbox", { name: /transcript/i });
    region.focus();
    fireEvent.keyDown(region, { key: "Delete" });

    expect(onDeleteSelection).toHaveBeenCalledTimes(1);
  });

  it("deletes the selection when Backspace is pressed on the focused region", () => {
    const onDeleteSelection = vi.fn();
    render(
      <TranscriptEditor
        transcript={transcript}
        selectedRange={{ fromIndex: 1, toIndex: 2 }}
        onDeleteSelection={onDeleteSelection}
      />,
    );

    const region = screen.getByRole("listbox", { name: /transcript/i });
    region.focus();
    fireEvent.keyDown(region, { key: "Backspace" });

    expect(onDeleteSelection).toHaveBeenCalledTimes(1);
  });

  it("ignores the delete keys when nothing is selected", () => {
    const onDeleteSelection = vi.fn();
    render(<TranscriptEditor transcript={transcript} onDeleteSelection={onDeleteSelection} />);

    const region = screen.getByRole("listbox", { name: /transcript/i });
    region.focus();
    fireEvent.keyDown(region, { key: "Delete" });
    fireEvent.keyDown(region, { key: "Backspace" });

    expect(onDeleteSelection).not.toHaveBeenCalled();
  });

  it("supports caret keys, selection, clear, and select all", () => {
    render(<TranscriptEditor transcript={transcript} />);
    const box = screen.getByRole("listbox", { name: /transcript/i });
    box.focus();
    fireEvent.keyDown(box, { key: "ArrowRight" });
    expect(box.getAttribute("aria-activedescendant")).toBe("transcript-word-w1");
    fireEvent.keyDown(box, { key: "ArrowRight", shiftKey: true });
    expect(screen.getByRole("option", { name: "again" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.keyDown(box, { key: "a", ctrlKey: true });
    expect(
      screen
        .getAllByRole("option")
        .every((option) => option.getAttribute("aria-selected") === "true"),
    ).toBe(true);
    fireEvent.keyDown(box, { key: "Escape" });
    expect(
      screen
        .getAllByRole("option")
        .every((option) => option.getAttribute("aria-selected") !== "true"),
    ).toBe(true);
    fireEvent.keyDown(box, { key: "End" });
    expect(box.getAttribute("aria-activedescendant")).toBe("transcript-word-w2");
    fireEvent.keyDown(box, { key: "Home" });
    expect(box.getAttribute("aria-activedescendant")).toBe("transcript-word-w0");
    fireEvent.keyDown(box, { key: "a", metaKey: true });
    expect(
      screen
        .getAllByRole("option")
        .every((option) => option.getAttribute("aria-selected") === "true"),
    ).toBe(true);
  });

  it("restores the selected range with Space", () => {
    const onRestore = vi.fn();
    render(
      <TranscriptEditor
        transcript={removeWord(transcript, "w1")}
        selectedRange={{ fromIndex: 1, toIndex: 1 }}
        onRestore={onRestore}
      />,
    );
    const box = screen.getByRole("listbox", { name: /transcript/i });
    fireEvent.keyDown(box, { key: " " });
    expect(onRestore).toHaveBeenCalledWith(1, 1);
  });

  it("clears a controlled selection on Escape", () => {
    render(
      <TranscriptEditor transcript={transcript} selectedRange={{ fromIndex: 0, toIndex: 1 }} />,
    );
    const box = screen.getByRole("listbox", { name: /transcript/i });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(
      screen
        .getAllByRole("option")
        .every((option) => option.getAttribute("aria-selected") === "false"),
    ).toBe(true);
  });
});
