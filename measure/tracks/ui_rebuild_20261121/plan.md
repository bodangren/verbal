# Plan: UI Rebuild to Spec

**Status:** IN PROGRESS
**Created:** 2026-11-21
**Focus:** One reviewed IA, one project entry point, deletions included.

**Check command:** `npm run check` plus the browser walkthrough.

---

## Phase 1: Browser is the only way in

- [ ] `GET /api/fs/list` gains `summary` per project entry (name, words, media, createdAt).
- [ ] Browser starts at home, remembers the last folder, keeps Up/Home working.
- [ ] *New project here* creates in the browsed folder.
- [ ] Delete the rail Project panel, `ProjectPicker`, the Scan-folder form, and `GET /api/projects/list`.
- [ ] Commit: `feat(ui): Make the project browser the only way in`

---

## Phase 2: Modes own their panes

- [ ] Ingest = browser + Capture; Edit = player + transcript + Cleanup/Freeze; Deliver = storyboard + preview + Export.
- [ ] No cross-mode panels; nothing renders outside the inventory table.
- [ ] Commit: `feat(ui): Give each mode only its own panes`

---

## Phase 3: States

- [ ] Empty, loading and error state per surface, per the spec table.
- [ ] Status bar is the single async channel (`role="status"`).
- [ ] Commit: `feat(ui): Handle empty, loading and error states`

---

## Phase 4: Verification

- [ ] Walkthrough drives the browser; asserts one entry point and zero page scroll at two viewports.
- [ ] Re-run the four dogfood projects; screenshot per mode.
- [ ] `npm run check` green.
- [ ] Commit: `test(e2e): Drive the rebuild by browser and mode`
