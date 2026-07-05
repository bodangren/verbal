# Plan: Multi-Range Delete & Reorder

**Status:** PLANNED  
**Created:** 2026-07-05  
**Focus:** Extend MVP text-driven delete to multi-range delete, paragraph reorder, silence insertion, and paragraph split.

---

## Phase 1: Segment Range Model

### Red
- [ ] Write failing tests for `domain.SegmentRange`: merge overlapping ranges, sort ranges, invert ranges relative to transcript duration.

### Green
- [ ] Add `domain.SegmentRange` type and helpers.
- [ ] Add transcript helper to convert word/paragraph selections into sorted, merged segment ranges.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(domain): Add segment range model`

---

## Phase 2: Delete Range Operation

### Red
- [ ] Write failing tests for `edit.DeleteRangeOperation`: given a list of ranges, return an edited transcript and ordered keep-ranges.

### Green
- [ ] Define `internal/edit/delete_range.go`.
- [ ] Implement range inversion and keep-range computation.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(edit): Add delete range operation`

---

## Phase 3: Reorder Operation

### Red
- [ ] Write failing tests for `edit.ReorderOperation`: move a paragraph block to a new index and produce reordered transcript + segments.

### Green
- [ ] Define `internal/edit/reorder.go`.
- [ ] Implement paragraph-block move with stable ordering of unaffected blocks.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(edit): Add paragraph reorder operation`

---

## Phase 4: Insert Silence & Split Operations

### Red
- [ ] Write failing tests for `edit.InsertSilenceOperation` and `edit.SplitOperation`.

### Green
- [ ] Define `internal/edit/silence.go` and `internal/edit/split.go`.
- [ ] Model silence as a placeholder segment with generated duration.
- [ ] Model split as a boundary marker in the transcript block list.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(edit): Add silence and split operations`

---

## Phase 5: Edit List & Session Service

### Red
- [ ] Write failing tests for `edit.Session`: an ordered list of operations that can be applied to produce a final transcript and segment schedule.

### Green
- [ ] Implement `internal/edit/session.go`.
- [ ] Expose `Apply()` returning final transcript and ordered media segments.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(edit): Add edit session service`

---

## Phase 6: Multi-Segment Export Pipeline

### Red
- [ ] Write failing tests for `media/pipeline.MultiSegmentExporter`: concatenate keep-ranges, silence placeholders, and reordered segments.

### Green
- [ ] Extend pipeline builder to accept an ordered list of segments.
- [ ] Support stream-copy for keep-ranges, generated silence for placeholders, and re-encode fallback.
- [ ] Make tests pass with mocked GStreamer runner.

### Refactor
- [ ] Commit: `feat(media): Add multi-segment export pipeline`

---

## Phase 7: UI Wiring

### Red
- [ ] Write failing tests that range selection, reorder drag, silence insertion, and split actions route to the edit session.

### Green
- [ ] Add range selection to `TranscriptView`.
- [ ] Add paragraph drag reorder affordance.
- [ ] Add "Insert Silence" and "Split Paragraph" actions.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ui): Wire multi-range editing actions`

---

## Phase 8: Integration Verification

### Red
- [ ] Write an integration-style test with a real short media fixture: delete a sentence, reorder paragraphs, insert silence, and export.

### Green
- [ ] Run the full flow in a test and assert exported duration and segment order.
- [ ] Make test pass.

### Refactor
- [ ] Commit: `test(edit): Add multi-range editing integration test`

---

## Phase 9: Final Verification

- [ ] Run `make check`.
- [ ] Manual verification: import media, transcribe, perform delete/reorder/silence/split, export, verify result.
- [ ] Update `measure/tech-debt.md` and `measure/lessons-learned.md` if needed.
- [ ] Update this `plan.md` and `measure/tracks.md`.
- [ ] Commit: `measure(plan): Mark multi-range delete & reorder complete`
