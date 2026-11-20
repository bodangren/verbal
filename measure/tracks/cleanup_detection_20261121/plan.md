# Plan: Cleanup Detection and Review

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Detect filler words, stutters, and repetitions; review them; remove the accepted ones.

**Check command:** `npm run check` (and `npm run e2e` for the browser flow).

---

## Phase 1: Proposal detector

### Red
- [x] Failing tests: a filler word becomes a proposal with category `filler`, confidence `0.95`, and a reason naming the word.
- [x] Failing tests: a stutter ("I I I") proposes the repeats, not the first word.
- [x] Failing tests: a repeated bigram is proposed once as `repetition`.
- [x] Failing tests: proposals are ordered by index, a word is proposed at most once, and already-removed words are skipped.
- [x] Failing tests: a custom filler list replaces the default.

**Targeted Red command:**
```bash
npx vitest run packages/cleanup/src/detect.test.ts
```

### Green
- [x] Implement `detectProposals` and the default filler list in `packages/cleanup/src/detect.ts`.
- [x] Export it from the package root (browser-safe).
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(cleanup): Detect filler words, stutters, and repetitions`

---

## Phase 2: Cleanup API

### Red
- [x] Failing tests: `GET /api/cleanup` returns the proposals and an empty audio-fix list for a stored transcript.
- [x] Failing tests: no transcript is 404, a relative root is 400, another method is 405.

### Green
- [x] Add `apps/web/server/cleanup-api.ts`.
- [x] Add `apps/web/pages/api/cleanup.ts`.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(api): Serve cleanup proposals`

---

## Phase 3: Review and removal in the page

- [ ] Make `onFreeze` optional and render the freeze button only when it exists.
- [ ] Load proposals for the open project and render `CleanupReview` in a *Cleanup* panel.
- [ ] Add *Remove accepted*, applying `resolveAccepted` through `useTranscriptDocument` and reporting the count.
- [ ] Commit: `feat(ui): Review and apply cleanup proposals`

---

## Phase 4: Browser verification

- [ ] Extend `npm run e2e`: fixtures with fillers, review the panel, remove accepted, save, reload, and confirm the words stayed removed.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover cleanup review`
