# Plan: MVP Library & Export

**Status:** PLANNED  
**Created:** 2026-06-12  
**Focus:** Implement the library list view and basic export of the original media file.

---

## Phase 1: Library Repository

### Red
- [~] Write failing tests for listing, deleting, and updating recordings. (ef7dcc0)

### Green
- [ ] Implement methods in `internal/db/recording_repository.go`.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(db): Extend recording repository for library operations`

**Red-phase state (mid, attempt 4, after supervisor boundary complaint):**

Per the supervisor's feedback, the mid role may **not** introduce non-test,
non-Measure changes in the Red phase. Existing `internal/db/repository.go`
already covers List (ORDER BY created_at DESC), Update, and Delete with
their tests in `repository_test.go`. The *new* Red-phase contract — the
typed `RecordingStatus` enum and the status-filter method that
[test-strategy §5 P1](./test-strategy.md) identifies as the gap between
Phase 1 (storage) and Phase 2 (LibraryView status badge per [spec FR2](./spec.md))
— is committed as a skip-guarded test file only:

- **New file:** `internal/db/recording_status_test.go` — 8 tests
  (IsValid truth-table, constant string values, helper validation,
  `ValidRecordingStatuses` completeness, `ListByStatus` happy path /
  ordering / invalid-arg / empty-table). Every test is guarded with
  `t.Skip("track mvp_library_export_20260612 phase 1 task in progress")`
  per test-strategy §8.
- The same file contains a clearly-marked **stub block** of the
  expected API (RecordingStatus type, four constants, `IsValid`,
  `ValidRecordingStatuses`, `ValidateRecordingStatus`) so the file
  compiles and the rest of `internal/db` keeps passing under
  `make go-check`. The next Green-phase attempt must:
    1. delete the stub block,
    2. remove every `t.Skip` guard in the test file,
    3. add the real implementation in `internal/db/recording_status.go`
       and a new method on `*RecordingRepository`,
  all in one commit (workflow §3-4 + test-strategy §8).

No production code (`internal/db/recording_status.go`,
`internal/db/repository.go`) is touched in this attempt, and no
non-test/non-Measure files outside the worktree (no `internal/ui/*`,
no `AGENTS.md`, no archived tracks) are modified.

**Red verification (mid, attempt 5, supervisor re-entry after status 70):**

The prior `mid-attempt-2` invocation exited with status 70
(`OpenCode server is unavailable`, per `automation-supervisor.py:1055`)
before any model calls completed — the output log records only
`STARTED_AT` and the supervisor JSON header. The substantive
work from the earlier successful `ef7dcc0` commit is preserved in
HEAD (no rollback needed) and is re-verified here:

- `internal/db/recording_status_test.go` is in HEAD at `ef7dcc0`:
  8 tests, all guarded with
  `t.Skip("track mvp_library_export_20260612 phase 1 task in progress")`,
  followed by a clearly-marked STUB block (type, four constants,
  `IsValid`, `ValidRecordingStatuses`, `ValidateRecordingStatus`,
  `(*RecordingRepository).ListByStatus`) that lets the file compile.
- Targeted Red command on the file alone (count=1, cache busted):
  `go test -count=1 -run 'TestRecordingStatus|TestValidateRecordingStatus|TestValidRecordingStatuses|TestRecordingRepository_ListByStatus' ./internal/db/`
  → 8 SKIP, 0 FAIL (each `t.Skip` fires; no real test executes).
- Aggregate gate for the package: `go test -count=1 ./internal/db/`
  → `ok verbal/internal/db` (the STUB block keeps the package
  building; the rest of the suite is unaffected).
- Full `make go-check` re-run on this attempt: 18/18 packages green
  (`cmd/verbal`, `internal/ai`, `internal/ai/local`, `internal/ai/realtime`,
  `internal/app`, `internal/db`, `internal/domain`, `internal/edit`,
  `internal/filler`, `internal/lifecycle`, `internal/media`,
  `internal/settings`, `internal/sync`, `internal/thumbnail`,
  `internal/transcription`, `internal/transcription/batch`,
  `internal/ui`, `internal/waveform`). A pre-existing flaky
  `TestCreateBackup_CreatesConsistentSnapshotWithConcurrentWrites`
  in `internal/lifecycle` was observed once during the initial
  full run (SQLITE_BUSY under load) but passes on re-run — unrelated
  to this track; logged in the running aggregate.
- The Red task remains `[~]` because the Green-phase commit
  (delete STUB block, drop `t.Skip` guards, add
  `internal/db/recording_status.go` and the real
  `(*RecordingRepository).ListByStatus`) is intentionally
  deferred — workflow §3-4 + test-strategy §8 require all three
  changes to land in a single later commit.

This commit (`docs(measure): ...`) only updates `plan.md` (a
Measure doc) and does not touch any non-test, non-Measure file,
so the Red-phase boundary holds.

---

## Phase 2: Library View Widget

### Red
- [ ] Write failing tests for `ui.LibraryView`: renders list, emits selection and delete events.

### Green
- [ ] Implement `internal/ui/library_view.go`.
- [ ] Use GTK `ListView` or `ColumnView`.
- [ ] Display title, duration, date, status badge.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ui): Add library view widget`

---

## Phase 3: Original Export

### Red
- [ ] Write failing tests for `media.Exporter`: copies source file to destination with progress.

### Green
- [ ] Implement `internal/media/exporter.go`.
- [ ] Use buffered copy with progress callback.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(media): Add original file exporter`

---

## Phase 4: UI Wiring

### Red
- [ ] Write failing tests that controller routes export/delete intents to services.

### Green
- [ ] Add "Export" and "Delete" actions to the app controller.
- [ ] Add export file chooser dialog.
- [ ] Add delete confirmation dialog.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ui): Wire library export and delete actions`

---

## Phase 5: Project Storage Layout

### Red
- [ ] Write failing tests for project directory creation and paths.

### Green
- [ ] Implement `internal/settings/paths.go` or similar.
- [ ] Create `projectDir/recordings/` and `projectDir/verbal.db` on first run.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(settings): Add project directory layout`

---

## Phase 6: Final Verification

- [ ] Run `make check`.
- [ ] Manual verification: import/record files, view library, export a file, delete a file.
- [ ] Update `measure/tech-debt.md` and `measure/lessons-learned.md` if needed.
- [ ] Update this `plan.md` and `measure/tracks.md`.
- [ ] Commit: `measure(plan): Mark MVP library & export complete`
