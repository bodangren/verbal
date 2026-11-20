# Plan: Batch Transcription

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Plan eligible projects, run them sequentially, report each outcome.

**Check command:** `npm run check`.

---

## Phase 1: Planner

### Red
- [x] Failing tests: skip when a transcript exists, transcribe otherwise, `force` overrides, no-media is skipped with a reason, duplicates collapse, order is preserved.

**Targeted Red command:**
```bash
npx vitest run packages/core/src/batch.test.ts
```

### Green
- [x] Implement `planBatch` in `packages/core/src/batch.ts` and export it.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(core): Plan a transcription batch`

---

## Phase 2: Runner

- [x] `runBatch` transcribing items in order, continuing past a failure, reporting a summary.
- [x] Commit: `feat(api): Run a transcription batch`

---

## Phase 3: Endpoint and page

- [x] `POST /api/transcribe/batch` returning the plan and a job.
- [ ] Page: batch field, start action, per-item summary.
- [x] Commit: `feat(ui): Start a transcription batch`

---

## Phase 4: Verification

- [ ] Extend `npm run e2e` to batch two projects against the fake ASR.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover batch transcription`
