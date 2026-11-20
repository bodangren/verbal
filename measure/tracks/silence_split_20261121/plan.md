# Plan: Insert Silence and Split Segment

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Two pure transcript operations, then editor and page wiring.

**Check command:** `npm run check`.

---

## Phase 1: Core operations

### Red
- [x] Failing tests: silence shifts only later words; zero or negative seconds is a no-op; an unknown anchor throws.
- [x] Failing tests: splitting starts a new segment at the word; splitting at a segment head is a no-op; ids stay unique across repeated splits.

**Targeted Red command:**
```bash
npx vitest run packages/core/src/transcript-edit.test.ts
```

### Green
- [x] Implement `insertSilence` and `splitSegment` in `packages/core/src/transcript.ts`.
- [x] Export and make tests pass.

### Refactor
- [x] Commit: `feat(core): Add insert silence and split segment`

---

## Phase 2: Editing hook

- [x] Add `insertSilence(afterWordId, seconds)` and `splitSegment(beforeWordId)` to `useTranscriptDocument`, each one history entry.
- [x] Commit: `feat(ui): Edit document structure through the hook`

---

## Phase 3: Page wiring

- [ ] Add *Insert silence* with a seconds field and *Split segment* to the transcript panel, acting on the selected word.
- [ ] Commit: `feat(ui): Insert silence and split segments from the page`

---

## Phase 4: Verification

- [x] Extend `npm run e2e`: split at a word and insert silence, then undo both.
- [x] Run `npm run check` and `npm run e2e`.
- [x] Commit: `test(e2e): Cover silence and split`
