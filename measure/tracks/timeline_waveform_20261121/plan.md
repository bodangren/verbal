# Plan: Timeline Waveform

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Pure argv, cached endpoint, click-to-seek image.

**Check command:** `npm run check`.

---

## Phase 1: Arg builder

### Red
- [ ] Failing tests: defaults, size clamping, colour validation, and the argv shape.

**Targeted Red command:**
```bash
npx vitest run packages/media/src/waveform.test.ts
```

### Green
- [ ] Implement `buildWaveformArgs` and `normaliseWaveform` in `packages/media/src/waveform.ts`.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(media): Build showwavespic arguments`

---

## Phase 2: Endpoint

- [ ] Add `apps/web/server/waveform-api.ts` with a content-keyed cache under `cache/`.
- [ ] Add `GET /api/media/waveform`.
- [ ] Route tests: render, cache hit, missing media, bad root, wrong method.
- [ ] Commit: `feat(api): Serve a cached waveform image`

---

## Phase 3: Page

- [ ] Show the waveform in the playback panel and seek on click.
- [ ] Commit: `feat(ui): Seek from the waveform`

---

## Phase 4: Verification

- [ ] Extend `npm run e2e`: click the waveform and assert the media sought.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover waveform seeking`
