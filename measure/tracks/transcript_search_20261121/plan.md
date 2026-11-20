# Plan: Transcript Search and Navigation

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Pure search, editor highlighting, page navigation.

**Check command:** `npm run check`.

---

## Phase 1: Search function

### Red
- [ ] Failing tests: a single word, a phrase spanning words, case and punctuation insensitivity, blank query, no match, and removed words.

**Targeted Red command:**
```bash
npx vitest run packages/core/src/search.test.ts
```

### Green
- [ ] Implement `searchTranscript` in `packages/core/src/search.ts` and export it.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(core): Search the transcript for phrases`

---

## Phase 2: Editor highlighting

- [ ] Add `matchedRanges` and `data-match` to `TranscriptEditor`.
- [ ] Commit: `feat(ui): Highlight transcript search matches`

---

## Phase 3: Search box and navigation

- [ ] Add the field, count, and Previous/Next to the transcript panel; stepping selects the match.
- [ ] Commit: `feat(ui): Navigate transcript search matches`

---

## Phase 4: Verification

- [ ] Extend `npm run e2e`: search a word, assert the count and highlight, step to the next match.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover transcript search`
