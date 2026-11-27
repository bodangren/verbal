export type Caret = { index: number; anchor: number | null };
export type CaretSelection = Caret & { selection: { fromIndex: number; toIndex: number } | null };

export function moveCaret(
  index: number,
  delta: number,
  count: number,
  edge?: "home" | "end",
): Caret {
  return {
    index:
      edge === "home"
        ? 0
        : edge === "end"
          ? Math.max(0, count - 1)
          : Math.max(0, Math.min(Math.max(0, count - 1), index + delta)),
    anchor: null,
  };
}

export function extendSelection(
  index: number,
  anchor: number | null,
  delta: number,
  _min: number,
  count: number,
): Caret {
  return {
    index: Math.max(0, Math.min(Math.max(0, count - 1), index + delta)),
    anchor: anchor ?? index,
  };
}

export function selectAll(count: number): CaretSelection {
  return { index: 0, anchor: 0, selection: count ? { fromIndex: 0, toIndex: count - 1 } : null };
}

export function clearSelection(index: number): CaretSelection {
  return { index, anchor: null, selection: null };
}
