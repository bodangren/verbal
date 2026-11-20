# Plan: Library UX

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Scan a folder, serve summaries, list and open from the page.

**Check command:** `npm run check`.

---

## Phase 1: Scanner

### Red
- [x] Failing tests: a project summary, a folder without a project skipped, an invalid project skipped, an invalid transcript, and newest-first ordering.

**Targeted Red command:**
```bash
npx vitest run packages/core/src/library.test.ts
```

### Green
- [x] Implement `scanLibrary` in `packages/core/src/library.ts` and export it.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(core): Scan a folder for projects`

---

## Phase 2: Endpoint

- [x] `GET /api/projects/list` with scanner wiring and route tests.
- [x] Commit: `feat(api): Serve the project library`

---

## Phase 3: Page

- [x] Library panel with a folder field, Scan, and Open per row.
- [x] Commit: `feat(ui): List and open projects from the library`

---

## Phase 4: Verification

- [ ] Extend `npm run e2e` to open a project from the library.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover opening from the library`
