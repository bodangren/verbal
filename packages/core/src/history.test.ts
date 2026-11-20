import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commit, createHistory, redo, undo } from "./history";

const value = (n: number) => ({ n });

describe("history", () => {
  it("starts with no past and no future", () => {
    const history = createHistory(value(1));

    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(history.present).toEqual(value(1));
  });

  it("round-trips a commit through undo", () => {
    const initial = createHistory(value(1));
    const edited = commit(initial, value(2));

    expect(undo(edited).present).toEqual(value(1));
  });

  it("restores the edited state on redo", () => {
    const initial = createHistory(value(1));
    const edited = commit(initial, value(2));

    expect(redo(undo(edited)).present).toEqual(value(2));
  });

  it("ignores an edit that returns the same reference", () => {
    const initial = createHistory(value(1));

    expect(commit(initial, initial.present)).toBe(initial);
  });

  it("clears the redo stack after a new edit", () => {
    const edited = commit(createHistory(value(1)), value(2));
    const undone = undo(edited);
    const branched = commit(undone, value(3));

    expect(canRedo(branched)).toBe(false);
    expect(branched.present).toEqual(value(3));
  });

  it("is a no-op when there is nothing to undo or redo", () => {
    const initial = createHistory(value(1));

    expect(undo(initial)).toBe(initial);
    expect(redo(initial)).toBe(initial);
  });

  it("keeps a deep history across several edits", () => {
    let history = createHistory(value(0));
    for (let n = 1; n <= 5; n += 1) {
      history = commit(history, value(n));
    }

    for (let n = 4; n >= 0; n -= 1) {
      history = undo(history);
      expect(history.present).toEqual(value(n));
    }
    expect(canUndo(history)).toBe(false);
  });
});
