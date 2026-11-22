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
