# Plan: Playback and Sync

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Serve project media, render the playback screen, sync the transcript.

**Check command:** `npm run check` (and `npm run e2e` for the browser flow).

---

## Phase 1: Range parsing and media path resolution

### Red
- [x] Failing tests: `parseByteRange` returns a closed range, an open-ended range, the tail for a suffix range, `null` for a malformed header, and `"unsatisfiable"` past the end.
- [x] Failing tests: `resolveMediaPath` prefers `assetPath`, falls back to `externalPath`, returns `null` with no media, and refuses a relative escape.

**Targeted Red command:**
```bash
npx vitest run packages/core/src/byte-range.test.ts packages/core/src/media-path.test.ts
```

### Green
- [x] Implement `parseByteRange` in `packages/core/src/byte-range.ts`.
- [x] Implement `resolveMediaPath` in `packages/core/src/media-path.ts` and export both.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(core): Add byte-range parsing and media path resolution`

---

## Phase 2: Media file route

### Red
- [x] Failing tests: a plain GET returns 200 with `Content-Type`, `Content-Length`, and `Accept-Ranges`.
- [x] Failing tests: a range request returns 206 with the exact bytes and `Content-Range`; a past-the-end range returns 416; HEAD returns headers and no body.
- [x] Failing tests: no media is 404, a relative root is 400, another method is 405.

### Green
- [x] Add `apps/web/server/media-file.ts` streaming through `fs.createReadStream`.
- [x] Add `apps/web/pages/api/media/file.ts` delegating to it.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(api): Serve project media with byte ranges`

---

## Phase 3: Page wiring

- [ ] Render a *Playback* panel with `PlaybackScreen` when `project.media` exists.
- [ ] Point it at `/api/media/file?root=...` and surface a missing-media error.
- [ ] Keep the editable transcript panel working alongside it.
- [ ] Commit: `feat(ui): Wire playback into the page`

---

## Phase 4: Browser verification

- [ ] Generate a short real clip, import it, and extend `npm run e2e`: play, assert the active word advances, click a word to seek, and assert the seek position.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover playback and sync`
