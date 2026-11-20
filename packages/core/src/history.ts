/** A single undoable document state and its neighbours. */
export type History<T> = {
  past: T[];
  present: T;
  future: T[];
};

/** Creates a history with nothing to undo or redo. */
export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Records a new state.
 *
 * Passing the current reference back is treated as "no change" and returns the
 * same history, so callers can commit optimistically without extra checks.
 */
export function commit<T>(history: History<T>, next: T): History<T> {
  if (Object.is(next, history.present)) {
    return history;
  }

  return { past: [...history.past, history.present], present: next, future: [] };
}

/** Moves one step back. A no-op when there is nothing to undo. */
export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) {
    return history;
  }

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

/** Moves one step forward. A no-op when there is nothing to redo. */
export function redo<T>(history: History<T>): History<T> {
  const next = history.future[0];
  if (next === undefined) {
    return history;
  }

  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}
