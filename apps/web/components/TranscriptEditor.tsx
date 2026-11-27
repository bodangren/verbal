import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { TranscriptDocument, TranscriptWord } from "@verbal/core/browser";
import { extendSelection, moveCaret, selectAll } from "../lib/caret";

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
  /** Called when Escape clears the selection. The page clears its own state. */
  onSelectionClear?: () => void;
  /** Called when Delete or Backspace is pressed on the region with a selection. */
  onDeleteSelection?: () => void;
  onRestore?: (fromIndex: number, toIndex: number) => void;
  caretIndex?: number;
  /** Test-only: reports a render of the word at `index`. */
  onWordRender?: (index: number) => void;
};

const EMPTY_RANGES: readonly WordSelection[] = [];

type SelectionState = { caret: number; anchor: number | null };

type SelectionAction =
  | { type: "move"; delta: number; count: number }
  | { type: "extend"; delta: number; count: number }
  | { type: "selectAll"; count: number }
  | { type: "clear" }
  | { type: "click"; index: number; shift: boolean }
  | { type: "sync" };

/**
 * One reducer for the caret and the local selection. `anchor` is null while
 * the page controls the selection, an index while the user extends a range,
 * and equal to `caret` after a move or clear (a collapsed, empty selection).
 */
function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "move": {
      const next = moveCaret(state.caret, action.delta, action.count);
      return { caret: next.index, anchor: next.index };
    }
    case "extend": {
      const next = extendSelection(state.caret, state.anchor, action.delta, 0, action.count);
      return { caret: next.index, anchor: next.anchor };
    }
    case "selectAll": {
      const all = selectAll(action.count);
      return { caret: all.index, anchor: all.selection ? all.selection.toIndex : null };
    }
    case "clear":
      return { caret: state.caret, anchor: state.caret };
    case "click":
      if (action.shift) {
        return { caret: action.index, anchor: state.anchor ?? state.caret };
      }
      return { caret: action.index, anchor: null };
    case "sync":
      return { caret: state.caret, anchor: null };
  }
}

/** The visible selection: a local range, the page range, or nothing. */
function deriveSelection(
  state: SelectionState,
  selectedRange: WordSelection | null,
): WordSelection | null {
  if (state.anchor === null) {
    return selectedRange;
  }
  if (state.anchor === state.caret) {
    return null;
  }
  return {
    fromIndex: Math.min(state.anchor, state.caret),
    toIndex: Math.max(state.anchor, state.caret),
  };
}

type WordProps = {
  word: TranscriptWord;
  index: number;
  removed: boolean;
  active: boolean;
  matchSet: ReadonlySet<number>;
  selected: boolean;
  caret: boolean;
  silenceSeconds: number | undefined;
  onActivate: (index: number, shiftKey: boolean) => void;
  onWordRender?: (index: number) => void;
};

const Word = memo(function Word({
  word,
  index,
  removed,
  active,
  matchSet,
  selected,
  caret,
  silenceSeconds,
  onActivate,
  onWordRender,
}: WordProps) {
  onWordRender?.(index);
  return (
    <Fragment>
      <span
        className="transcript__word"
        id={`transcript-word-${word.id}`}
        role="option"
        aria-selected={selected}
        aria-disabled={removed || undefined}
        data-word-id={word.id}
        data-removed={removed ? "true" : undefined}
        data-active={active ? "true" : undefined}
        data-selected={selected ? "true" : undefined}
        data-caret={caret ? "true" : undefined}
        data-match={matchSet.has(index) ? "true" : undefined}
        aria-current={active ? "true" : undefined}
        onClick={(event) => onActivate(index, event.shiftKey)}
      >
        {word.text}
      </span>
      {silenceSeconds !== undefined && (
        <span
          className="transcript__silence"
          aria-label={`${silenceSeconds} second${silenceSeconds === 1 ? "" : "s"} of silence`}
        >
          {silenceSeconds} s silence
        </span>
      )}
    </Fragment>
  );
});

export function TranscriptEditor({
  transcript,
  label = "Transcript",
  activeWordId = null,
  selectedRange = null,
  matchedRanges = EMPTY_RANGES,
  onWordClick,
  onSelectionChange,
  onSelectionClear,
  onDeleteSelection,
  onRestore,
  caretIndex,
  onWordRender,
}: TranscriptEditorProps) {
  const [state, dispatch] = useReducer(selectionReducer, { caret: 0, anchor: null });

  // When the page changes the controlled range, the local selection yields to it.
  const [previousRange, setPreviousRange] = useState(selectedRange);
  if (previousRange !== selectedRange) {
    setPreviousRange(selectedRange);
    dispatch({ type: "sync" });
  }

  const effectiveSelection = deriveSelection(state, selectedRange);

  const removed = useMemo(() => new Set(transcript.removedWordIds), [transcript.removedWordIds]);

  const silencesByWord = useMemo(() => {
    const map = new Map<string, number>();
    for (const silence of transcript.silences ?? []) {
      map.set(silence.afterWordId, silence.seconds);
    }
    return map;
  }, [transcript.silences]);

  const matchSet = useMemo(() => {
    const set = new Set<number>();
    for (const range of matchedRanges) {
      for (let index = range.fromIndex; index <= range.toIndex; index += 1) {
        set.add(index);
      }
    }
    return set;
  }, [matchedRanges]);

  const { indexById, wordById } = useMemo(() => {
    const indices = new Map<string, number>();
    const words = new Map<string, TranscriptWord>();
    transcript.words.forEach((word, index) => {
      indices.set(word.id, index);
      words.set(word.id, word);
    });
    return { indexById: indices, wordById: words };
  }, [transcript.words]);

  const activeCaret = caretIndex ?? state.caret;

  const scrollToWord = (index: number) => {
    document
      .getElementById(`transcript-word-${transcript.words[index]?.id}`)
      ?.scrollIntoView?.({ block: "nearest" });
  };

  const nextKeptWordIndex = (range: WordSelection): number | null => {
    for (let index = range.toIndex + 1; index < transcript.words.length; index += 1) {
      const word = transcript.words[index];
      if (word !== undefined && !removed.has(word.id)) {
        return index;
      }
    }
    for (let index = range.fromIndex - 1; index >= 0; index -= 1) {
      const word = transcript.words[index];
      if (word !== undefined && !removed.has(word.id)) {
        return index;
      }
    }
    return null;
  };

  // Stable per-word handler; reads the latest state and props through a ref.
  const activateRef = useRef<(index: number, shiftKey: boolean) => void>(() => {});
  useEffect(() => {
    activateRef.current = (index, shiftKey) => {
      if (shiftKey) {
        const anchor = state.anchor ?? state.caret;
        dispatch({ type: "click", index, shift: true });
        const fromIndex = Math.min(anchor, index);
        const toIndex = Math.max(anchor, index);
        onSelectionChange?.(
          { fromIndex, toIndex },
          transcript.words.slice(fromIndex, toIndex + 1).map((word) => word.id),
        );
      } else {
        dispatch({ type: "click", index, shift: false });
        onWordClick?.(transcript.words[index]?.id ?? "", index);
      }
      scrollToWord(index);
    };
  });
  const activate = useCallback((index: number, shiftKey: boolean) => {
    activateRef.current(index, shiftKey);
  }, []);

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
        const count = transcript.words.length;
        if (count === 0) return;
        const current = caretIndex ?? state.caret;
        const select = (targetIndex: number, shift: boolean) => {
          const delta = targetIndex - current;
          if (shift) {
            const next = extendSelection(current, state.anchor, delta, 0, count);
            dispatch({ type: "extend", delta, count });
            const anchor = next.anchor ?? next.index;
            const fromIndex = Math.min(anchor, next.index);
            const toIndex = Math.max(anchor, next.index);
            onSelectionChange?.(
              { fromIndex, toIndex },
              transcript.words.slice(fromIndex, toIndex + 1).map((word) => word.id),
            );
            scrollToWord(next.index);
          } else {
            dispatch({ type: "move", delta, count });
            scrollToWord(targetIndex);
          }
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
          dispatch({ type: "selectAll", count });
          const all = selectAll(count);
          if (all.selection) {
            onSelectionChange?.(all.selection, transcript.words.map((word) => word.id));
          }
        } else if (event.key === "Escape") {
          dispatch({ type: "clear" });
          onSelectionClear?.();
        } else if (
          (event.key === "Delete" || event.key === "Backspace") &&
          effectiveSelection != null
        ) {
          event.preventDefault();
          onDeleteSelection?.();
          const nextKept = nextKeptWordIndex(effectiveSelection);
          if (nextKept !== null) {
            dispatch({ type: "move", delta: nextKept - current, count });
          }
        } else if (event.key === " " && effectiveSelection != null) {
          event.preventDefault();
          onRestore?.(effectiveSelection.fromIndex, effectiveSelection.toIndex);
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
              effectiveSelection != null &&
              index >= effectiveSelection.fromIndex &&
              index <= effectiveSelection.toIndex;
            const silenceSeconds = silencesByWord.get(wordId);

            return (
              <Word
                key={word.id}
                word={word}
                index={index}
                removed={isRemoved}
                active={isActive}
                matchSet={matchSet}
                selected={isSelected}
                caret={index === activeCaret}
                silenceSeconds={silenceSeconds}
                onActivate={activate}
                onWordRender={onWordRender}
              />
            );
          })}
        </p>
      ))}
    </section>
  );
}
