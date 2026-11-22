# Plan: Repository Review and Improvement Planning

**Status:** COMPLETE — documentation assignment; repository formatting and audit remain open
**Created:** 2026-11-22
**Focus:** Review first. Plan fixes without implementing them.

**Check command:** `npm run format:check`, `npm run check`, and eligible `npm run e2e`.

---

## Phase 1: Evidence and planning

- [x] Review production paths and behavior tests; record file and line evidence. `fd1bed5`
- [x] Run the existing gates through the shared heavy runner; record exact results. `fd1bed5`
- [x] Write the ranked review and six pending improvement tracks. `3f72eb0`
- [x] Update the registry and directive while preserving standing rules.
- [x] Verify documentation, commit on the planning branch, and hand off to PM.

Documentation-only work uses source checks and existing gates, not artificial failing application tests.

## Verification results

- `npm ci`: exit 0; 290 packages added; 299 audited; 42.273 seconds.
- First `npm run check`: exit 0; 648 tests passed, two skipped; 23.96 seconds.
- `npm run e2e`: exit 0; walkthrough passed; 8.85 seconds.
- `npm run format:check`: exit 1; 98 existing files failed formatting; 2.12 seconds.
- Second `npm run check`: exit 0; 648 tests passed, two skipped; 23.00 seconds.
- `npm audit --json`: exit 1; four moderate affected packages through one advisory.
- Focused formatting and static track validation pass.
- Independent delegation was unavailable because the tool reached its depth limit.
  PM must perform the independent plan check before merge.

The repository-contract track owns the formatting and dependency findings.
This review does not claim application acceptance.

---

## Phase 2: Primary UI/UX review (Daniel, 2026-11-22)

- [x] Build and run the app on 127.0.0.1 through the heavy runner; capture 52 screens at three viewports with fake ASR.
- [x] Compare the app with Daniel's three target screens (`screens/target-*.jpg`).
- [x] Write `measure/review-ux-2026-11-22.md`: 21 ranked findings and the UX plan.
- [x] Write six UX tracks (`ux_*_20261122`); put them first in the registry and set the merged order in the directive.
- [x] Copy nine key screens to `screens/ux-*.png`, each under 300 KB.
- [ ] PM checks the evidence, merges, and pushes.

### Phase 2 verification results

- Capture run (heavy runner): `npm run build` OK; capture script finished with no failure.
- `npx prettier --check` on the changed files: pass, but `.prettierignore` excludes `measure/`.
  With `--ignore-path /dev/null`: the new review passes after one table reformat; `measure/tracks.md` already failed before this branch.
- `npm run check`: exit 0; 648 tests passed, two skipped.
