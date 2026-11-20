# Plan: Auto-Save Transcript Edits

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Debounced, single-flight saving of settled transcript edits.

**Check command:** `npm run check`.

---

## Phase 1: Auto-save hook

### Red
- [x] Failing tests: a clean document schedules nothing; a dirty one saves after the delay; a further edit restarts the timer; becoming clean cancels; saves never overlap and queue one follow-up.

**Targeted Red command:**
```bash
npx vitest run apps/web/hooks/use-auto-save.test.tsx
```

### Green
- [x] Implement `useAutoSave` over `setTimeout` with an injectable scheduler.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(ui): Add debounced auto-save hook`

---

## Phase 2: Page wiring

- [x] Auto-save the transcript and report *Saving…* in the status line.
- [x] Keep the explicit *Save transcript* control.
- [x] Commit: `feat(ui): Auto-save transcript edits`

---

## Phase 3: Verification

- [ ] Extend `npm run e2e`: make an edit, wait without clicking Save, and assert the status reaches *Saved* and survives a reload.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover transcript auto-save`
