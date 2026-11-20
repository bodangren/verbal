import { useMemo, useState } from "react";
import type { TranscriptDocument, TranscriptWord } from "@verbal/core";

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
  /** Called when a word is activated without a modifier. */
  onWordClick?: (wordId: string, index: number) => void;
  /** Called when a shift-click produces a range. */
  onSelectionChange?: (selection: WordSelection, wordIds: string[]) => void;
  /** Called when Delete or Backspace is pressed on the region with a selection. */
  onDeleteSelection?: () => void;
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
  onWordClick,
  onSelectionChange,
  onDeleteSelection,
}: TranscriptEditorProps) {
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  const removed = useMemo(
    () => new Set(transcript.removedWordIds),
    [transcript.removedWordIds],
  );

  const { indexById, wordById } = useMemo(() => {
    const indices = new Map<string, number>();
    const words = new Map<string, TranscriptWord>();
    transcript.words.forEach((word, index) => {
      indices.set(word.id, index);
      words.set(word.id, word);
    });
    return { indexById: indices, wordById: words };
  }, [transcript.words]);

  const activate = (word: TranscriptWord, index: number, shiftKey: boolean) => {
    if (shiftKey && anchorIndex !== null) {
      const fromIndex = Math.min(anchorIndex, index);
      const toIndex = Math.max(anchorIndex, index);
      const wordIds = transcript.words.slice(fromIndex, toIndex + 1).map((item) => item.id);

      setAnchorIndex(index);
      onSelectionChange?.({ fromIndex, toIndex }, wordIds);
      return;
    }

    setAnchorIndex(index);
    onWordClick?.(word.id, index);
  };

  return (
    <section
      className="transcript"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(event) => {
        if (selectedRange === null) {
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onDeleteSelection?.();
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
            const isSelected =
              selectedRange !== null &&
              index >= selectedRange.fromIndex &&
              index <= selectedRange.toIndex;

            return (
              <button
                key={word.id}
                type="button"
                className="transcript__word"
                data-word-id={word.id}
                data-removed={isRemoved ? "true" : undefined}
                data-active={isActive ? "true" : undefined}
                data-selected={isSelected ? "true" : undefined}
                aria-current={isActive ? "true" : undefined}
                disabled={isRemoved}
                onClick={(event) => activate(word, index, event.shiftKey)}
              >
                {word.text}
              </button>
            );
          })}
        </p>
      ))}
    </section>
  );
}
