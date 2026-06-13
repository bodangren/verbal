# Plan: MVP Recording & Import

**Status:** PLANNED  
**Created:** 2026-06-12  
**Focus:** Record video/audio from hardware and import existing media files into the library.

---

## Phase 1: Recorder Interface & Fake

### Red
- [ ] Write failing tests for `media.Recorder` interface: `Start`, `Stop`, `Cancel`.

### Green
- [ ] Define `internal/media/recorder.go` with `Recorder` interface.
- [ ] Implement `fakeRecorder` for tests that records start/stop/cancel calls and returns a dummy file path.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(media): Add Recorder interface and fake`

---

## Phase 2: GStreamer Recorder

### Red
- [ ] Write failing tests for pipeline string generation and state transitions (using fakes for GStreamer elements).

### Green
- [ ] Implement `internal/media/gst_recorder.go` with GStreamer pipeline.
- [ ] Pipeline: `v4l2src` video + `autoaudiosrc` audio → `encodebin` → `filesink` to MP4/MKV.
- [ ] Handle `Start`, `Stop`, `Cancel` with proper state changes.
- [ ] Make tests pass.

### Refactor
- [ ] Sanitize output file paths.
- [ ] Commit: `feat(media): Add GStreamer recorder implementation`

---

## Phase 3: Importer

### Red
- [ ] Write failing tests for `media.Importer`: import returns a `Recording` with correct path and duration.

### Green
- [ ] Implement `internal/media/importer.go`.
- [ ] Copy or reference the source file into the project directory.
- [ ] Probe duration via GStreamer discoverer or fallback.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(media): Add media importer`

---

## Phase 4: Library Persistence

### Red
- [ ] Write failing tests for recording repository: create recording, list recordings, update status, delete.

### Green
- [ ] Implement `internal/db/recording_repository.go`.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(db): Add recording repository`

---

## Phase 5: UI Wiring

### Red
- [ ] Write failing tests that the app controller routes record/import intents to the recorder/importer.

### Green
- [ ] Add "Record" and "Import" actions to the app controller.
- [ ] Add GTK header bar buttons and menu items.
- [ ] Wire actions to controller methods.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ui): Wire record and import actions`

---

## Phase 6: Final Verification

- [ ] Run `make check`.
- [ ] Manual verification: record a short clip and import a file; both appear in the library.
- [ ] Update `measure/tech-debt.md` and `measure/lessons-learned.md` if needed.
- [ ] Update this `plan.md` and `measure/tracks.md`.
- [ ] Commit: `measure(plan): Mark MVP recording & import complete`
