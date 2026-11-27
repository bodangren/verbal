# Plan: Transcript as a Document

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** Caret, keyboard selection, restore, and tools next to the selection.

**Check command:** `npm run check`, `npm run e2e`, and `node tools/e2e/ux-gates.mjs`.
**Dependencies:** `ux_gates_20261122`, `ux_shell_flow_20261122`.

---

## Phase 1: Caret and keyboard selection

### Red

- [ ] Add failing pure tests for caret movement and selection extension.
      File: `apps/web/components/transcript-caret.test.ts` (new).
      Cover word, line, paragraph, and document moves; removed words; the anchor rule.
- [ ] Add failing component tests for one tab stop, `aria-activedescendant`, Shift+arrows, Ctrl+A, and Escape.
      File: `apps/web/components/transcript-editor.test.tsx`.

**Targeted Red command:** `npx vitest run apps/web/components/transcript-caret.test.ts apps/web/components/transcript-editor.test.tsx`.

### Green

- [ ] Implement the caret model as pure functions.
      File: `apps/web/components/transcript-caret.ts` (new).
- [ ] Render words as spans in one focusable textbox. Wire the keys.
      Files: `apps/web/components/TranscriptEditor.tsx`, `apps/web/styles/globals.css`.

### Verification

- [ ] Run the targeted tests and the gate tab-stop check.
- [ ] Commit the phase.

---

## Phase 2: Mouse selection, restore, and keys

### Red

- [ ] Add failing tests for `restoreRange` as one pure edit.
      File: `packages/core/src/transcript.test.ts`.
- [ ] Add failing hook tests for restore and Alt+Up/Down as single undo steps.
      File: `apps/web/hooks/use-transcript-document.test.tsx`.
- [ ] Add failing component tests for drag, double-click, triple-click, Delete-to-restore, and Space.
      File: `apps/web/components/transcript-editor.test.tsx`.

**Targeted Red command:** `npx vitest run packages/core/src/transcript.test.ts apps/web/hooks/use-transcript-document.test.tsx apps/web/components/transcript-editor.test.tsx`.

### Green

- [ ] Add `restoreRange` and expose it on the hook.
      Files: `packages/core/src/transcript.ts`, `apps/web/hooks/use-transcript-document.ts`.
- [ ] Add pointer selection and the edit keys.
      File: `apps/web/components/TranscriptEditor.tsx`.

### Verification

- [ ] Run the targeted tests.
- [ ] Commit the phase.

---

## Phase 3: Selection toolbar and reading view

### Red

- [ ] Add failing tests for the toolbar placement and its role, names, and shortcut titles.
      Files: `apps/web/components/selection-toolbar.test.tsx` (new), `apps/web/components/toolbar-position.test.ts` (new).
      Placement is a pure function of the selection box and the stage box.
- [ ] Add failing tests for paragraph times, the follow-scroll pause, and reduced motion.
      File: `apps/web/components/transcript-editor.test.tsx`.
- [ ] Add failing e2e steps: 4-key delete, drag select, restore, follow scroll, and Space.
      File: `tools/e2e/walkthrough.mjs`.
- [ ] Add a failing 5,000-word benchmark test.
      File: `apps/web/components/transcript-editor.bench.test.tsx` (new).

**Targeted Red command:** `npx vitest run apps/web/components/selection-toolbar.test.tsx apps/web/components/toolbar-position.test.ts apps/web/components/transcript-editor.test.tsx`.

### Green

- [ ] Build the floating toolbar and remove the footer edit row and the Save button.
      Files: `apps/web/components/SelectionToolbar.tsx` (new), `apps/web/components/toolbar-position.ts` (new), `apps/web/pages/index.tsx`.
- [ ] Add paragraph times, the pill and tint styles, follow-scroll, and `content-visibility`.
      Files: `apps/web/components/TranscriptEditor.tsx`, `apps/web/styles/globals.css`.

### Verification

- [ ] Run `npm run check`, `npm run e2e`, and the gate through the heavy runner.
- [ ] Re-capture Edit at three viewports and compare with `target-edit.jpg`.
- [ ] Check the transcript with Orca once; record the result.
- [ ] Commit evidence; update the registry and metadata after acceptance.
