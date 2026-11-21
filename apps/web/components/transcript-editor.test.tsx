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
  it("renders the transcript as a labelled region of word buttons", () => {
    render(<TranscriptEditor transcript={transcript} />);

    expect(screen.getByRole("region", { name: /transcript/i })).toBeTruthy();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "hello",
      "world",
      "again",
    ]);
  });

  it("reports the word id and index when a word is activated", () => {
    const onWordClick = vi.fn();
    render(<TranscriptEditor transcript={transcript} onWordClick={onWordClick} />);

    fireEvent.click(screen.getByRole("button", { name: "world" }));

    expect(onWordClick).toHaveBeenCalledWith("w1", 1);
  });

  it("reports a selection when a second word is shift-clicked", () => {
    const onSelectionChange = vi.fn();
    render(<TranscriptEditor transcript={transcript} onSelectionChange={onSelectionChange} />);

    fireEvent.click(screen.getByRole("button", { name: "hello" }));
    fireEvent.click(screen.getByRole("button", { name: "again" }), { shiftKey: true });

    expect(onSelectionChange).toHaveBeenCalledWith({ fromIndex: 0, toIndex: 2 }, [
      "w0",
      "w1",
      "w2",
    ]);
  });

  it("marks removed words as disabled with a data attribute", () => {
    const edited = removeWord(transcript, "w1");
    render(<TranscriptEditor transcript={edited} />);

    const button = screen.getByRole("button", { name: "world" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("data-removed")).toBe("true");
  });

  it("marks the active word with aria-current", () => {
    render(<TranscriptEditor transcript={transcript} activeWordId="w1" />);

    const button = screen.getByRole("button", { name: "world" });
    expect(button.getAttribute("aria-current")).toBe("true");
  });

  it("marks every word inside a search match with data-match", () => {
    render(<TranscriptEditor transcript={transcript} matchedRanges={[{ fromIndex: 0, toIndex: 1 }]} />);

    expect(screen.getByRole("button", { name: "hello" }).getAttribute("data-match")).toBe("true");
    expect(screen.getByRole("button", { name: "world" }).getAttribute("data-match")).toBe("true");
    expect(screen.getByRole("button", { name: "again" }).hasAttribute("data-match")).toBe(false);
  });

  it("marks every word in the selected range with data-selected", () => {
    render(<TranscriptEditor transcript={transcript} selectedRange={{ fromIndex: 0, toIndex: 1 }} />);

    expect(screen.getByRole("button", { name: "hello" }).getAttribute("data-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "world" }).getAttribute("data-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "again" }).hasAttribute("data-selected")).toBe(
      false,
    );
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

    const region = screen.getByRole("region", { name: /transcript/i });
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

    const region = screen.getByRole("region", { name: /transcript/i });
    region.focus();
    fireEvent.keyDown(region, { key: "Backspace" });

    expect(onDeleteSelection).toHaveBeenCalledTimes(1);
  });

  it("ignores the delete keys when nothing is selected", () => {
    const onDeleteSelection = vi.fn();
    render(<TranscriptEditor transcript={transcript} onDeleteSelection={onDeleteSelection} />);

    const region = screen.getByRole("region", { name: /transcript/i });
    region.focus();
    fireEvent.keyDown(region, { key: "Delete" });
    fireEvent.keyDown(region, { key: "Backspace" });

    expect(onDeleteSelection).not.toHaveBeenCalled();
  });
});
