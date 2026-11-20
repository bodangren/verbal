# Plan: Transcription in the UI

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Start transcription from the page, follow the job, refresh the transcript.

**Check command:** `npm run check` (and `npm run e2e` for the browser flow).

---

## Phase 1: Route verified against a fake ASR server

### Red
- [x] Failing test: with `OPENAI_BASE_URL` pointed at a fake server and a key set, `POST /api/transcribe` returns 202, the job reaches `done`, and `transcript.json` holds the returned words.
- [x] Failing test: with no key the route returns 503 and the message names `OPENAI_API_KEY`.

**Targeted Red command:**
```bash
npx vitest run apps/web/server/transcribe-api.test.ts
```

### Green
- [x] Add the test against the real route handler with an in-memory job registry.
- [x] Fix whatever the route needs to satisfy the contract.
- [x] Make tests pass.

### Refactor
- [x] Commit: `test(api): Verify transcription against a fake ASR server`

---

## Phase 2: Page wiring

- [ ] Add a *Transcription* panel with **Transcribe media**, disabled without a project, media, or while a job runs.
- [ ] Post to `/api/transcribe`, follow the job, and show status and percentage.
- [ ] On success, reload the transcript and cleanup proposals and report the word count.
- [ ] Commit: `feat(ui): Transcribe media from the page`

---

## Phase 3: Browser verification

- [ ] Start a fake ASR server in `npm run e2e` and pass `OPENAI_API_KEY`/`OPENAI_BASE_URL` to the app server.
- [ ] Transcribe a second project's clip in the browser; assert the words appear in the editor and in the cleanup panel.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover transcription from the page`
