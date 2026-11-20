# Plan: Library UX

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Scan a folder, serve summaries, list and open from the page.

**Check command:** `npm run check`.

---

## Phase 1: Scanner

### Red
- [ ] Failing tests: a project summary, a folder without a project skipped, an invalid project skipped, an invalid transcript, and newest-first ordering.

**Targeted Red command:**
```bash
npx vitest run packages/core/src/library.test.ts
```

### Green
- [ ] Implement `scanLibrary` in `packages/core/src/library.ts` and export it.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(core): Scan a folder for projects`

---

## Phase 2: Endpoint

- [ ] `GET /api/projects/list` with scanner wiring and route tests.
- [ ] Commit: `feat(api): Serve the project library`

---

## Phase 3: Page

- [ ] Library panel with a folder field, Scan, and Open per row.
- [ ] Commit: `feat(ui): List and open projects from the library`

---

## Phase 4: Verification

- [ ] Extend `npm run e2e` to open a project from the library.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Commit: `test(e2e): Cover opening from the library`
