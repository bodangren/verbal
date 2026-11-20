# Plan: Application Shell and Workflow

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** Viewport-locked three-pane shell with Ingest/Edit/Deliver modes.

**Check command:** `npm run check` (plus the browser walkthrough).

---

## Phase 1: Shell layout

- [ ] Lock the document to the viewport; add title bar, three-column body, status bar.
- [ ] Give panes their own scrolling and clamped widths.
- [ ] Commit: `feat(ui): Lock the app to a three-pane shell`

---

## Phase 2: Modes

- [ ] Add the mode switcher and per-panel mode attributes; move Capture and Cleanup so each pane is contiguous.
- [ ] Hide rather than unmount inactive panels, so state survives a switch.
- [ ] Commit: `feat(ui): Split the workspace into ingest, edit, and deliver modes`

---

## Phase 3: Status bar

- [ ] Move errors, messages, job progress, and save state into the title and status bars.
- [ ] Commit: `feat(ui): Report state in the shell chrome`

---

## Phase 4: Verification

- [ ] Update `tools/e2e/walkthrough.mjs` for mode navigation; assert no page scroll in each mode.
- [ ] Run `npm run check` and the walkthrough.
- [ ] Commit: `test(e2e): Drive the shell by mode`

---

## Phase 5: Dogfooding

- [ ] Record the next walkthrough using Verbal itself for the storyboard/export step where it is capable, and note the gaps that force external tooling.
- [ ] Commit: `docs: Record the dogfooding findings`
