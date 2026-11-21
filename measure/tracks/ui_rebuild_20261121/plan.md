# Plan: UI Rebuild to Spec

**Status:** COMPLETE
**Created:** 2026-11-21
**Focus:** One reviewed IA, one project entry point, deletions included.

**Check command:** `npm run check` plus the browser walkthrough.

---

## Phase 1: Browser is the only way in

- [x] `GET /api/fs/list` gains `summary` per project entry (name, words, media, createdAt).
- [x] Browser starts at home, remembers the last folder, keeps Up/Home working.
- [x] *New project here* creates in the browsed folder.
- [x] Delete the rail Project panel, `ProjectPicker`, the Scan-folder form, and `GET /api/projects/list`.
- [x] Commit: `feat(ui): Make the project browser the only way in`

---

## Phase 2: Modes own their panes

- [x] Ingest = browser + Capture; Edit = player + transcript + Cleanup/Freeze; Deliver = storyboard + preview + Export.
- [x] No cross-mode panels; nothing renders outside the inventory table.
- [x] Commit: `feat(ui): Give each mode only its own panes`

---

## Phase 3: States

- [x] Empty, loading and error state per surface, per the spec table.
- [x] Status bar is the single async channel (`role="status"`).
- [x] Commit: `feat(ui): Handle empty, loading and error states`

---

## Phase 4: Verification

- [x] Walkthrough drives the browser; asserts one entry point and zero page scroll at two viewports.
- [x] Re-run the four dogfood projects; screenshot per mode.
- [x] `npm run check` green.
- [x] Commit: `test(e2e): Drive the rebuild by browser and mode`

---

## Follow-up: Playback (2026-11-21)

- [x] Stop the stage from shrinking the player card (the transport was clipped).
- [x] Render the player whenever media exists, with or without a transcript.
- [x] Add a visible, keyboard-operable scrubber, time readout, and playhead.
- [x] Land on the player after importing or recording.
- [x] Unit tests for playing before transcription and scrubbing; e2e guards for clipping and End/Home scrubbing.
