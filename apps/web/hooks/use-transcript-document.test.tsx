// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTranscript, type TranscriptDocument } from "@verbal/core";
import { useTranscriptDocument } from "./use-transcript-document";

const SPOKEN = [
  { text: "keep", start: 0, end: 0.4 },
  { text: "cut", start: 0.45, end: 0.9 },
  { text: "this", start: 0.95, end: 1.3 },
  { text: "tail", start: 1.4, end: 1.8 },
];

const transcript = createTranscript(SPOKEN);

/** Removed word ids, failing loudly if the document unexpectedly vanished. */
function removedWordIds(document: TranscriptDocument | null): string[] {
  if (document === null) {
    throw new Error("expected an open document");
  }
  return document.removedWordIds;
}

describe("useTranscriptDocument", () => {
  it("starts clean, deletable, and with nothing to undo", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    expect(result.current.document).toBe(transcript);
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("deletes a range and marks the document dirty", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() => result.current.removeRange(1, 2));

    expect(removedWordIds(result.current.document)).toEqual(["w1", "w2"]);
    expect(result.current.dirty).toBe(true);
    expect(result.current.canUndo).toBe(true);
    // The original document is untouched: edits are immutable.
    expect(transcript.removedWordIds).toEqual([]);
  });

  it("undoes to the previous document and reports redos", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() => result.current.removeRange(1, 2));
    const edited = result.current.document;

    act(() => result.current.undo());
    expect(result.current.document).toBe(transcript);
    expect(result.current.dirty).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.document).toBe(edited);
    expect(result.current.dirty).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("clears redo when a new edit follows an undo", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() => result.current.removeRange(1, 2));
    act(() => result.current.undo());
    act(() => result.current.removeRange(3, 3));

    expect(removedWordIds(result.current.document)).toEqual(["w3"]);
    expect(result.current.canRedo).toBe(false);
  });

  it("treats re-deleting an already removed range as no change", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() => result.current.removeRange(1, 2));
    const once = result.current.document;

    act(() => result.current.removeRange(1, 2));

    expect(result.current.document).toBe(once);
    expect(result.current.canUndo).toBe(true);
  });

  it("markSaved clears the dirty flag without changing the document", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() => result.current.removeRange(1, 2));
    const edited = result.current.document;

    act(() => result.current.markSaved());

    expect(result.current.document).toBe(edited);
    expect(result.current.dirty).toBe(false);

    act(() => result.current.undo());
    expect(result.current.dirty).toBe(true);
  });

  it("reset swaps in a saved document and drops the history", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() => result.current.removeRange(0, 3));

    const loaded = createTranscript(SPOKEN);
    act(() => result.current.reset(loaded));

    expect(result.current.document).toBe(loaded);
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("removes several ranges as a single undoable edit", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() =>
      result.current.removeRanges([
        { fromIndex: 0, toIndex: 0 },
        { fromIndex: 2, toIndex: 2 },
      ]),
    );

    expect(removedWordIds(result.current.document)).toEqual(["w0", "w2"]);

    act(() => result.current.undo());
    expect(removedWordIds(result.current.document)).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });

  it("ignores out-of-range entries when removing several ranges", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() =>
      result.current.removeRanges([
        { fromIndex: 1, toIndex: 1 },
        { fromIndex: 9, toIndex: 12 },
      ]),
    );

    expect(removedWordIds(result.current.document)).toEqual(["w1"]);
  });

  it("inserts silence as one undoable edit", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() => result.current.insertSilence("w0", 2));

    const shifted = result.current.document;
    expect(shifted?.words[1]?.start).toBeCloseTo(2.45);
    expect(shifted?.words[0]?.start).toBe(0);
    expect(result.current.dirty).toBe(true);

    act(() => result.current.undo());
    expect(removedWordIds(result.current.document)).toEqual([]);
    expect(result.current.document?.words[1]?.start).toBeCloseTo(0.45);
    expect(result.current.canUndo).toBe(false);
  });

  it("splits a segment as one undoable edit", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    const before = result.current.document?.segments.length ?? 0;
    act(() => result.current.splitSegment("w2"));

    expect(result.current.document?.segments.length).toBe(before + 1);

    act(() => result.current.undo());
    expect(result.current.document?.segments.length).toBe(before);
  });

  it("reorders words as one undoable edit", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() => result.current.moveRange(0, 0, 2));

    const order = result.current.document?.words.map((word) => word.text) ?? [];
    expect(order.slice(0, 3)).toEqual(["cut", "this", "keep"]);
    expect(result.current.dirty).toBe(true);

    act(() => result.current.undo());
    expect(result.current.document?.words[0]?.text).toBe("keep");
    expect(result.current.canUndo).toBe(false);
  });

  it("ignores structural edits while the document is empty", () => {
    const { result } = renderHook(() => useTranscriptDocument(null));

    act(() => result.current.insertSilence("w0", 1));
    act(() => result.current.splitSegment("w0"));

    expect(result.current.document).toBeNull();
    expect(result.current.canUndo).toBe(false);
  });

  it("reset(null) empties the document", () => {
    const { result } = renderHook(() => useTranscriptDocument(transcript));

    act(() => result.current.reset(null));

    expect(result.current.document).toBeNull();
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });
});
