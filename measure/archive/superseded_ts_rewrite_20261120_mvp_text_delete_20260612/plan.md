# Plan: MVP Text-Driven Delete

**Status:** PLANNED  
**Created:** 2026-06-12  
**Focus:** Delete a single word from the transcript and export a new media file with that segment removed.

---

## Phase 1: Segment Model & Selection

### Red
- [ ] Write failing tests for `domain.Segment` and selection logic: given a word index, return `[Start, End]`.

### Green
- [ ] Add `domain.Segment` type and constructor.
- [ ] Add transcript helper to compute segment from selected word.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(domain): Add segment model`

---

## Phase 2: Edit Operation Interface

### Red
- [ ] Write failing tests for `edit.Operation`: `Apply` returns an edited transcript.

### Green
- [ ] Define `internal/edit/operation.go`.
- [ ] Implement `DeleteOperation` for single-word deletion.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(edit): Add delete operation`

---

## Phase 3: Segment Export Pipeline

### Red
- [ ] Write failing tests for `media/pipeline.SegmentExporter`: trim and concatenate before/after segments.

### Green
- [ ] Create `internal/media/pipeline/` package.
- [ ] Implement pipeline builder for single-segment delete.
- [ ] Support stream-copy and re-encode fallbacks.
- [ ] Make tests pass with mocked GStreamer runner.

### Refactor
- [ ] Commit: `feat(media): Add segment export pipeline`

---

## Phase 4: Export Service

### Red
- [ ] Write failing tests for edit/export service: delete word → export new file.

### Green
- [ ] Implement `internal/edit/service.go`.
- [ ] Orchestrate transcript update, segment computation, and media export.
- [ ] Persist edited transcript.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(edit): Add text-driven export service`

---

## Phase 5: UI Wiring

### Red
- [ ] Write failing tests that selecting a word and triggering delete calls the edit service.

### Green
- [ ] Add word selection to `TranscriptView`.
- [ ] Add Delete key handler and menu action.
- [ ] Add export dialog for the edited result.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ui): Wire single-word delete and export`

---

## Phase 6: Integration Verification

### Red
- [ ] Write an integration-style test with a real short media fixture: delete a word, export, verify duration is reduced.

### Green
- [ ] Create or obtain a small test fixture.
- [ ] Run the full flow in a test.
- [ ] Make test pass.

### Refactor
- [ ] Commit: `test(edit): Add single-word delete integration test`

---

## Phase 7: Final Verification

- [ ] Run `make check`.
- [ ] Manual verification: record/import, transcribe, delete a word, export, verify the word is gone.
- [ ] Update `measure/tech-debt.md` and `measure/lessons-learned.md`.
- [ ] Update this `plan.md` and `measure/tracks.md`.
- [ ] Commit: `measure(plan): Mark MVP text-driven delete complete`
