# Plan: Export Presets

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Named export bundles, threaded from the UI to FFmpeg.

**Check command:** `npm run check`.

---

## Phase 1: Preset module

### Red
- [x] Failing tests: every preset has the required fields; resolution returns a match, falls back to the default for unknown or missing ids, and extension handling appends only when needed.

**Targeted Red command:**
```bash
npx vitest run packages/media/src/presets.test.ts
```

### Green
- [x] Implement `EXPORT_PRESETS`, `DEFAULT_PRESET_ID`, `resolvePreset`, and `withPresetExtension` in `packages/media/src/presets.ts`.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(media): Add named export presets`

---

## Phase 2: Endpoint

- [x] Accept `preset` in `POST /api/export`, apply its codecs and extension, and echo the id.
- [x] Route test proving the preset reaches FFmpeg's argv.
- [x] Commit: `feat(api): Export with a preset`

---

## Phase 3: Page

- [x] Add the preset selector to the Export panel and send the choice.
- [x] Commit: `feat(ui): Choose an export preset`

---

## Phase 4: Verification

- [ ] Assert the selector in the walkthrough; run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover the export preset selector`
