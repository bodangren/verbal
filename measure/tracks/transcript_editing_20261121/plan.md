# Plan: Transcript Editing

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Make the transcript editable — delete, undo/redo, save.

**Check command:** `npm run check` (and `npm run e2e` for the browser flow).

---

## Phase 1: Editing document hook

### Red
- [x] Failing tests: a fresh document is clean, deletable, and has nothing to undo.
- [x] Failing tests: deleting a range removes the words and marks the document dirty.
- [x] Failing tests: undo restores the previous document; redo re-applies; a new edit clears redo.
- [x] Failing tests: `markSaved` clears the dirty flag; `reset` swaps documents and marks them saved.

**Targeted Red command:**
```bash
npx vitest run apps/web/hooks/use-transcript-document.test.tsx
```

### Green
- [x] Implement `useTranscriptDocument` over `createHistory`/`commit`/`undo`/`redo`/`removeRange`.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(ui): Add transcript editing hook`

---

## Phase 2: Selection and deletion in the editor

### Red
- [x] Failing tests: a selected range marks its words with `data-selected`.
- [x] Failing tests: `Delete` and `Backspace` on the focused region call `onDeleteSelection`.
- [x] Failing tests: with no selection, the keys do nothing.

### Green
- [x] Add `selectedRange` and `onDeleteSelection` props.
- [x] Make the region focusable and handle the keys.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(ui): Add transcript selection and delete`

---

## Phase 3: Page wiring

- [ ] Replace the read-only transcript state with the hook.
- [ ] Add Delete selection / Undo / Redo / Save controls and a dirty label.
- [ ] Wire `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and `Ctrl/Cmd+Y`, ignoring text inputs.
- [ ] Save through `PUT /api/transcript` and mark the document saved on success.
- [ ] Commit: `feat(ui): Wire transcript editing into the page`

---

## Phase 4: Browser verification

- [ ] Extend `npm run e2e`: select a range, delete, undo, redo, save, reload, and confirm the words stay removed.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover transcript editing`
