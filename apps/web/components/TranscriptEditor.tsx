import { useEffect, useMemo, useState } from "react";
import type { TranscriptDocument, TranscriptWord } from "@verbal/core/browser";
import { clearSelection, extendSelection, moveCaret, selectAll } from "../lib/caret";

/** An inclusive range of word indices. */
export type WordSelection = {
  fromIndex: number;
  toIndex: number;
};

export type TranscriptEditorProps = {
  transcript: TranscriptDocument;
  /** Accessible name of the region. Distinct labels keep two editors apart. */
  label?: string;
  /** Word to mark as currently spoken, if any. */
  activeWordId?: string | null;
  /** Range of words the page is treating as selected, if any. */
  selectedRange?: WordSelection | null;
  /** Word ranges that matched a search, marked with data-match. */
  matchedRanges?: readonly WordSelection[];
  /** Called when a word is activated without a modifier. */
  onWordClick?: (wordId: string, index: number) => void;
  /** Called when a shift-click produces a range. */
  onSelectionChange?: (selection: WordSelection, wordIds: string[]) => void;
  /** Called when Delete or Backspace is pressed on the region with a selection. */
  onDeleteSelection?: () => void;
  onRestore?: (fromIndex: number, toIndex: number) => void;
  caretIndex?: number;
};

/**
 * Renders a transcript as a sequence of word buttons.
 *
 * Words are real buttons so keyboard activation, focus order, and accessible
 * names come from the platform rather than from ARIA patches. Removed words
 * stay in the document (so undo is lossless) and are rendered disabled.
 */
export function TranscriptEditor({
  transcript,
  label = "Transcript",
  activeWordId = null,
  selectedRange = null,
  matchedRanges = [],
  onWordClick,
  onSelectionChange,
  onDeleteSelection,
  onRestore,
  caretIndex,
}: TranscriptEditorProps) {
  const [caret, setCaret] = useState({ index: 0, anchor: null as number | null });
  const [keyboardSelection, setKeyboardSelection] = useState<WordSelection | null>(null);
  const [selectionOverride, setSelectionOverride] = useState<WordSelection | null | undefined>(
    undefined,
  );
  const effectiveSelection =
    selectionOverride === null ? null : (keyboardSelection ?? selectedRange);
  useEffect(() => setKeyboardSelection(null), [selectedRange]);

  const removed = useMemo(() => new Set(transcript.removedWordIds), [transcript.removedWordIds]);

  const { indexById, wordById } = useMemo(() => {
    const indices = new Map<string, number>();
    const words = new Map<string, TranscriptWord>();
    transcript.words.forEach((word, index) => {
      indices.set(word.id, index);
      words.set(word.id, word);
    });
    return { indexById: indices, wordById: words };
  }, [transcript.words]);

  const activeCaret = caretIndex ?? caret.index;
  const activate = (word: TranscriptWord, index: number, shiftKey: boolean) => {
    setCaret({ index, anchor: shiftKey ? (caret.anchor ?? caret.index) : index });
    if (shiftKey && (caret.anchor !== null || caret.index !== null)) {
      const anchor = caret.anchor ?? caret.index;
      const fromIndex = Math.min(anchor, index);
      const toIndex = Math.max(anchor, index);
      const wordIds = transcript.words.slice(fromIndex, toIndex + 1).map((item) => item.id);

      setSelectionOverride(undefined);
      onSelectionChange?.({ fromIndex, toIndex }, wordIds);
      return;
    }

    setKeyboardSelection(null);
    setSelectionOverride(undefined);
    onWordClick?.(word.id, index);
  };

  return (
    <section
      className="transcript"
      role="listbox"
      aria-multiselectable="true"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={
        transcript.words.length
          ? `transcript-word-${transcript.words[activeCaret]?.id ?? transcript.words[0]?.id}`
          : undefined
      }
      onKeyDown={(event) => {
        const current = caretIndex ?? caret.index;
        const count = transcript.words.length;
        if (count === 0) return;
        const wordAt = (index: number) => transcript.words[index];
        const select = (index: number, shift: boolean) => {
          const result = shift
            ? extendSelection(current, caret.anchor, index - current, 0, count)
            : moveCaret(current, index - current, count);
          setCaret(result);
          if (shift) {
            const anchor = result.anchor ?? current;
            const range = {
              fromIndex: Math.min(anchor, result.index),
              toIndex: Math.max(anchor, result.index),
            };
            setKeyboardSelection(range);
            setSelectionOverride(undefined);
            onSelectionChange?.(
              range,
              transcript.words.slice(range.fromIndex, range.toIndex + 1).map((word) => word.id),
            );
          } else {
            setKeyboardSelection(null);
            setSelectionOverride(null);
          }
          document
            .getElementById(`transcript-word-${wordAt(result.index)?.id}`)
            ?.scrollIntoView?.({ block: "nearest" });
        };
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          select(
            Math.max(0, Math.min(count - 1, current + (event.key === "ArrowLeft" ? -1 : 1))),
            event.shiftKey,
          );
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          select(event.key === "Home" ? 0 : count - 1, event.shiftKey);
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          const all = selectAll(count);
          setCaret(all);
          setKeyboardSelection(all.selection);
          setSelectionOverride(all.selection);
          if (all.selection)
            onSelectionChange?.(
              all.selection,
              transcript.words.map((word) => word.id),
            );
        } else if (event.key === "Escape") {
          const cleared = clearSelection(current);
          setCaret(cleared);
          setKeyboardSelection(null);
          setSelectionOverride(null);
          onSelectionChange?.(
            { fromIndex: current, toIndex: current },
            [transcript.words[current]?.id].filter(Boolean) as string[],
          );
        } else if (
          (event.key === "Delete" || event.key === "Backspace") &&
          effectiveSelection != null
        ) {
          event.preventDefault();
          onDeleteSelection?.();
        } else if (event.key === " " && effectiveSelection != null) {
          event.preventDefault();
          const range = effectiveSelection;
          onRestore?.(range.fromIndex, range.toIndex);
        }
      }}
    >
      {transcript.segments.map((segment) => (
        <p className="transcript__segment" key={segment.id}>
          {segment.wordIds.map((wordId) => {
            const word = wordById.get(wordId);
            if (word === undefined) {
              return null;
            }

            const index = indexById.get(wordId) ?? -1;
            const isRemoved = removed.has(wordId);
            const isActive = wordId === activeWordId;
            const isMatch = matchedRanges.some(
              (range) => index >= range.fromIndex && index <= range.toIndex,
            );
            const isSelected =
              effectiveSelection != null &&
              index >= effectiveSelection.fromIndex &&
              index <= effectiveSelection.toIndex;

            return (
              <span
                key={word.id}
                className="transcript__word"
                id={`transcript-word-${word.id}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={isRemoved || undefined}
                data-word-id={word.id}
                data-removed={isRemoved ? "true" : undefined}
                data-active={isActive ? "true" : undefined}
                data-selected={isSelected ? "true" : undefined}
                data-caret={index === activeCaret ? "true" : undefined}
                data-match={isMatch ? "true" : undefined}
                aria-current={isActive ? "true" : undefined}
                onClick={(event) => activate(word, index, event.shiftKey)}
              >
                {word.text}
              </span>
            );
          })}
        </p>
      ))}
    </section>
  );
}
