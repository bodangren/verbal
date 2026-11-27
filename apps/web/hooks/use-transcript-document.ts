import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  commit,
  createHistory,
  redo as historyRedo,
  insertSilence as insertTranscriptSilence,
  moveRange as moveTranscriptRange,
  removeRange as removeTranscriptRange,
  restoreRange as restoreTranscriptRange,
  splitSegment as splitTranscriptSegment,
  undo as historyUndo,
  type History,
  type TranscriptDocument,
} from "@verbal/core/browser";

/** An inclusive range of word indices. */
export type IndexRange = {
  fromIndex: number;
  toIndex: number;
};

/** The editable transcript and the actions that change it. */
export type TranscriptDocumentController = {
  /** The current document, or null when no project is open. */
  document: TranscriptDocument | null;
  /** True when the document differs from the last saved state. */
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Removes an inclusive range of words. Out-of-range ranges are ignored. */
  removeRange: (fromIndex: number, toIndex: number) => void;
  /** Removes several ranges as one edit, so one undo restores them all. */
  removeRanges: (ranges: readonly IndexRange[]) => void;
  /** Revives the removed words in an inclusive range. Out-of-range ranges are ignored. */
  restore: (fromIndex: number, toIndex: number) => void;
  /** Inserts air after a word by shifting every later word. */
  insertSilence: (afterWordId: string, seconds: number) => void;
  /** Starts a new segment at a word. */
  splitSegment: (beforeWordId: string) => void;
  /** Moves an inclusive word block so it starts at targetIndex. */
  moveRange: (fromIndex: number, toIndex: number, targetIndex: number) => void;
  undo: () => void;
  redo: () => void;
  /** Records that the current document has been written to disk. */
  markSaved: () => void;
  /** Swaps in a freshly loaded document and drops the edit history. */
  reset: (document: TranscriptDocument | null) => void;
};

type State = {
  history: History<TranscriptDocument | null>;
  saved: TranscriptDocument | null;
};

function initialState(initial: TranscriptDocument | null): State {
  return { history: createHistory(initial), saved: initial };
}

function isValidRange(
  transcript: TranscriptDocument,
  fromIndex: number,
  toIndex: number,
): boolean {
  return (
    Number.isInteger(fromIndex) &&
    Number.isInteger(toIndex) &&
    fromIndex >= 0 &&
    toIndex >= fromIndex &&
    toIndex < transcript.words.length
  );
}

/**
 * Owns the editable transcript: the document itself, its undo history, and
 * whether it has unsaved changes.
 *
 * Dirtiness is reference identity against the last saved document, so undoing
 * back to the loaded state reports clean without comparing whole documents.
 * The `initial` argument is only the starting document; later loaded documents
 * arrive through `reset`, which keeps the history honest across projects.
 */
export function useTranscriptDocument(
  initial: TranscriptDocument | null,
): TranscriptDocumentController {
  const [state, setState] = useState<State>(() => initialState(initial));

  const removeRange = useCallback((fromIndex: number, toIndex: number) => {
    setState((current) => {
      const present = current.history.present;
      if (present === null || !isValidRange(present, fromIndex, toIndex)) {
        return current;
      }

      const next = removeTranscriptRange(present, fromIndex, toIndex);
      const history = commit(current.history, next);

      return history === current.history ? current : { ...current, history };
    });
  }, []);

  // The document is mirrored in a ref so the structural edits can validate
  // before touching state, which lets an unknown word surface as an error
  // instead of a silent no-op inside a state updater.
  const presentRef = useRef(state.history.present);
  useEffect(() => {
    presentRef.current = state.history.present;
  });

  const applyStructuralEdit = useCallback(
    (edit: (document: TranscriptDocument) => TranscriptDocument) => {
      const present = presentRef.current;
      if (present === null) {
        return;
      }

      const next = edit(present);

      setState((current) => {
        const history = commit(current.history, next);
        return history === current.history ? current : { ...current, history };
      });
    },
    [],
  );

  const insertSilence = useCallback(
    (afterWordId: string, seconds: number) => {
      applyStructuralEdit((document) => insertTranscriptSilence(document, afterWordId, seconds));
    },
    [applyStructuralEdit],
  );

  const moveRange = useCallback(
    (fromIndex: number, toIndex: number, targetIndex: number) => {
      applyStructuralEdit((document) =>
        moveTranscriptRange(document, fromIndex, toIndex, targetIndex),
      );
    },
    [applyStructuralEdit],
  );

  const splitSegment = useCallback(
    (beforeWordId: string) => {
      applyStructuralEdit((document) => splitTranscriptSegment(document, beforeWordId));
    },
    [applyStructuralEdit],
  );

  const removeRanges = useCallback((ranges: readonly IndexRange[]) => {
    setState((current) => {
      const present = current.history.present;
      if (present === null) {
        return current;
      }

      let next = present;
      for (const { fromIndex, toIndex } of ranges) {
        if (!isValidRange(next, fromIndex, toIndex)) {
          continue;
        }
        next = removeTranscriptRange(next, fromIndex, toIndex);
      }

      const history = commit(current.history, next);

      return history === current.history ? current : { ...current, history };
    });
  }, []);

  const restore = useCallback((fromIndex: number, toIndex: number) => {
    setState((current) => {
      const present = current.history.present;
      if (present === null || !isValidRange(present, fromIndex, toIndex)) {
        return current;
      }

      const next = restoreTranscriptRange(present, fromIndex, toIndex);
      const history = commit(current.history, next);

      return history === current.history ? current : { ...current, history };
    });
  }, []);

  const undo = useCallback(() => {
    setState((current) => ({ ...current, history: historyUndo(current.history) }));
  }, []);

  const redo = useCallback(() => {
    setState((current) => ({ ...current, history: historyRedo(current.history) }));
  }, []);

  const markSaved = useCallback(() => {
    setState((current) => ({ ...current, saved: current.history.present }));
  }, []);

  const reset = useCallback((document: TranscriptDocument | null) => {
    setState(initialState(document));
  }, []);

  return useMemo(
    () => ({
      document: state.history.present,
      dirty: state.history.present !== state.saved,
      canUndo: historyCanUndo(state.history),
      canRedo: historyCanRedo(state.history),
      removeRange,
      removeRanges,
      restore,
      insertSilence,
      splitSegment,
      moveRange,
      undo,
      redo,
      markSaved,
      reset,
    }),
    [
      state,
      removeRange,
      removeRanges,
      restore,
      insertSilence,
      splitSegment,
      moveRange,
      undo,
      redo,
      markSaved,
      reset,
    ],
  );
}
