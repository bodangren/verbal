# Plan: Edit Inspector and Cleanup Review

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** Selection, cuts, cleanup review, and history in the Edit inspector.

**Check command:** `npm run check`, `npm run e2e`, and `node tools/e2e/ux-gates.mjs`.
**Dependencies:** `ux_gates_20261122`, `fe_transcript_20261127`.

---

## Phase 1: Selection card and edit summary

### Red

- [ ] Add failing pure tests for the edit summary and the timecode format.
      Files: `packages/core/src/edit-summary.test.ts` (new), `apps/web/lib/timecode.test.ts` (new).
      Cover no cuts, adjacent runs, a removed first word, and a removed last word.
- [ ] Add failing component tests for the selection card states.
      File: `apps/web/components/selection-card.test.tsx` (new).

**Targeted Red command:** `npx vitest run packages/core/src/edit-summary.test.ts apps/web/lib/timecode.test.ts apps/web/components/selection-card.test.tsx`.

### Green

- [ ] Implement the summary and the timecode format.
      Files: `packages/core/src/edit-summary.ts` (new), `packages/core/src/browser.ts`, `apps/web/lib/timecode.ts` (new).
- [ ] Build the selection card and the summary card.
      Files: `apps/web/components/SelectionCard.tsx` (new), `apps/web/components/EditSummary.tsx` (new).

### Verification

- [ ] Run the targeted tests.
- [ ] Commit the phase.

---

## Phase 2: Cleanup card and review list

### Red

- [ ] Add failing tests for the category cards, row names, the slider value text, and the confidence words.
      File: `apps/web/components/cleanup-review.test.tsx`.
- [ ] Add a failing page test: a row click selects and seeks.
      File: `apps/web/pages/index.test.tsx`.
- [ ] Add failing e2e steps: review a filler, remove all, undo once.
      File: `tools/e2e/walkthrough.mjs`.

**Targeted Red command:** `npx vitest run apps/web/components/cleanup-review.test.tsx apps/web/pages/index.test.tsx`.

### Green

- [ ] Rebuild the cleanup review as cards and a list. Move the id and Cover to a details line.
      File: `apps/web/components/CleanupReview.tsx`.
- [ ] Wire row selection and seek. Remove the save hint from the status text.
      File: `apps/web/pages/index.tsx`.

### Verification

- [ ] Run the targeted tests and the walkthrough.
- [ ] Commit the phase.

---

## Phase 3: Undo history and freeze

### Red

- [ ] Add failing pure tests for edit labels.
      File: `apps/web/hooks/edit-label.test.ts` (new).
- [ ] Add failing hook tests for labelled history and a jump to an entry as one step.
      File: `apps/web/hooks/use-transcript-document.test.tsx`.
- [ ] Add failing component tests for the history list and the Advanced freeze section.
      Files: `apps/web/components/undo-history.test.tsx` (new), `apps/web/components/cleanup-review.test.tsx`.

**Targeted Red command:** `npx vitest run apps/web/hooks/edit-label.test.ts apps/web/hooks/use-transcript-document.test.tsx apps/web/components/undo-history.test.tsx`.

### Green

- [ ] Add labels to history entries and a jump action.
      Files: `packages/core/src/history.ts`, `apps/web/hooks/edit-label.ts` (new), `apps/web/hooks/use-transcript-document.ts`.
- [ ] Build the history list. Move freeze into Advanced with a description.
      Files: `apps/web/components/UndoHistory.tsx` (new), `apps/web/components/CleanupReview.tsx`, `apps/web/pages/index.tsx`.

### Verification

- [ ] Run `npm run check`, `npm run e2e`, and the gate through the heavy runner.
- [ ] Re-capture the Edit inspector and compare with `target-edit.jpg`.
- [ ] Commit evidence; update the registry and metadata after acceptance.
