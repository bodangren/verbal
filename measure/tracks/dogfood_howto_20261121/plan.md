# Plan: Dogfood How-To Videos

**Status:** IN PROGRESS — first cut done
**Created:** 2026-11-21
**Focus:** Make a real how-to with Verbal, then fix what gets in the way.

**Check command:** `npm run check` and `npm run e2e`.

---

## Phase 1: Reproducible recorder

- [x] Fixture project with media and a scripted transcript, prepared through the API.
- [x] One-command browser recording with step timings.
- [x] Captions burned into an MP4 with FFmpeg.

---

## Phase 2: First how-to

- [x] Record the tour: open, play, scrub, seek by word, delete a filler, deliver.
- [x] Compose and review the MP4 frame by frame.
- [x] Record the honest limitation: scripted transcript, no ASR on this machine.

---

## Phase 3: UX findings

- [x] Write the issue log (findings.md) (symptom, why it matters, severity).
- [x] Fix the first-run blockers (waveform 500 on silent media).
- [x] Re-record with the fixes.

---

## Phase 4: Verify

- [x] `npm run check` green.
- [x] `npm run e2e` PASS (re-run after the waveform change).
- [x] Commit the harness and the fixes.
