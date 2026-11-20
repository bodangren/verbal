# Plan: Freeze Master and Cut List

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Honour stored removals when freezing, expose freeze over HTTP, wire the control.

**Check command:** `npm run check`.

---

## Phase 1: Stored removals reach the cut list

### Red
- [ ] Failing tests: a saved removal alone produces a cut list that omits the removed range.
- [ ] Failing tests: a saved removal and an accepted proposal covering different words both appear, once each.

**Targeted Red command:**
```bash
npx vitest run packages/cleanup/src/freeze.test.ts
```

### Green
- [ ] Merge `transcript.removedWordIds` into the freeze's removal set.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `fix(cleanup): Freeze honours removals already saved in the document`

---

## Phase 2: Freeze endpoint

- [ ] Add `apps/web/server/freeze-api.ts` computing the master from the stored transcript and probed duration.
- [ ] Add `POST /api/cleanup/freeze`.
- [ ] Red/Green route tests for 200/404/400/405.
- [ ] Commit: `feat(api): Freeze the cleaned master`

---

## Phase 3: Page wiring

- [ ] Pass `onFreeze` from the page and report duration, anchors, and fingerprint.
- [ ] Surface failures.
- [ ] Commit: `feat(ui): Freeze the master from the review`

---

## Phase 4: Verification

- [ ] Extend `npm run e2e` to freeze the project and assert the reported duration.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover freezing the master`
