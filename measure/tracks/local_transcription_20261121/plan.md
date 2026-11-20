# Plan: Local Offline Transcription

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** A CLI-backed provider, its JSON parser, and the environment switch.

**Check command:** `npm run check`.

---

## Phase 1: Parser

### Red
- [ ] Failing tests: offsets become seconds, empty text is skipped, a bad offset fails, an empty transcription yields no words.

**Targeted Red command:**
```bash
npx vitest run packages/ai/src/local.test.ts
```

### Green
- [ ] Implement `parseWhisperJson` in `packages/ai/src/local.ts`.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ai): Parse whisper CLI word output`

---

## Phase 2: Provider

- [ ] `createLocalWhisperProvider` with an argv builder and an injectable runner.
- [ ] Tests: argv shape, missing binary → `not-configured`, non-zero exit → `request-failed`, and a fake binary script producing a transcript.
- [ ] Commit: `feat(ai): Add a local whisper provider`

---

## Phase 3: Selection

- [ ] `VERBAL_ASR=local` in `createTranscribeService`, with the key check skipped for local.
- [ ] Tests for both switch values.
- [ ] Commit: `feat(api): Select the local provider by environment`

---

## Phase 4: Verification

- [ ] `npm run check` and `npm run e2e` (cloud path unchanged).
- [ ] Record in tech-debt that the real binary path is unverified on this machine.
- [ ] Commit: `test(ai): Cover local transcription selection`
