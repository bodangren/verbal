import { describe, expect, it } from "vitest";
import { clearSelection, extendSelection, moveCaret, selectAll } from "./caret";

describe("caret", () => {
  it("moves and clamps at document ends", () => {
    expect(moveCaret(0, -1, 3)).toEqual({ index: 0, anchor: null });
    expect(moveCaret(1, 1, 3)).toEqual({ index: 2, anchor: null });
    expect(moveCaret(1, 1, 3, "home")).toEqual({ index: 0, anchor: null });
    expect(moveCaret(1, 1, 3, "end")).toEqual({ index: 2, anchor: null });
  });

  it("extends from the fixed selection anchor", () => {
    expect(extendSelection(1, null, 1, 1, 4)).toEqual({ index: 2, anchor: 1 });
    expect(extendSelection(2, 1, -1, 1, 4)).toEqual({ index: 1, anchor: 1 });
  });

  it("selects all and clears selection", () => {
    expect(selectAll(4)).toEqual({ index: 0, anchor: 0, selection: { fromIndex: 0, toIndex: 3 } });
    expect(clearSelection(2)).toEqual({ index: 2, anchor: null, selection: null });
  });
});
