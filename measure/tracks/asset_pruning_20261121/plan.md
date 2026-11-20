# Plan: Asset Pruning

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Plan retention purely, report it, delete only on confirmation.

**Check command:** `npm run check`.

---

## Phase 1: Retention planner

### Red
- [x] Failing tests: referenced, user, recent, and prunable assets, plus stable ordering.

**Targeted Red command:**
```bash
npx vitest run packages/compose/src/prune.test.ts
```

### Green
- [x] Implement `planAssetPrune` in `packages/compose/src/prune.ts`.
- [x] Make tests pass.

### Refactor
- [x] Commit: `feat(compose): Plan generated-asset retention`

---

## Phase 2: Endpoint

- [x] `POST /api/storyboard/prune` returning the plan, and deleting only with `apply: true`.
- [x] Route tests for both modes and the error cases.
- [x] Commit: `feat(api): Report and apply asset pruning`

---

## Phase 3: Page

- [x] Prune assets action with a report-then-confirm step.
- [x] Commit: `feat(ui): Prune generated assets from the page`

---

## Phase 4: Verification

- [ ] Run `npm run check` and `npm run e2e`; note the tech-debt entry as resolved.
- [ ] Commit: `test(e2e): Cover asset pruning`
