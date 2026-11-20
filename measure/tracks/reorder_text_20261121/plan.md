# Plan: Reorder Text

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** A pure block move with consistent segments, then the editing action.

**Check command:** `npm run check`.

---

## Phase 1: Core move

### Red
- [x] Failing tests: move forward, move backward, clamp at the end, no-op for the same index and for an index inside the range, and `out-of-range` for bad ranges.
- [x] Failing tests: segments are rewritten in the new order, a moved word joins the anchor's segment across a boundary, and an emptied segment is dropped.

**Targeted Red command:**
```bash
npx vitest run packages/core/src/transcript-reorder.test.ts
```

### Green
- [x] Implement `moveRange` in `packages/core/src/transcript.ts`.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(core): Add block reordering`

---

## Phase 2: Editing hook

- [ ] Add `moveRange(fromIndex, toIndex, targetIndex)` to `useTranscriptDocument` as one history entry.
- [ ] Commit: `feat(ui): Reorder the document through the hook`

---

## Phase 3: Page

- [ ] Add *Move earlier* / *Move later* for the selection, moving by one word and keeping the selection on the block.
- [ ] Commit: `feat(ui): Reorder words from the page`

---

## Phase 4: Verification

- [ ] Extend `npm run e2e`: move a word, assert the new order, undo it.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover reordering`
