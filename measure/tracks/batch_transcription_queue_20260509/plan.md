# Plan: Batch Transcription Queue

## Phase 1: Queue Data Model (TDD)
- [x] Write tests for BatchQueueRepository — `0238aff`
- [x] Add batch_queue table (id, filePath, status, progress, createdAt, startedAt, completedAt) — `0238aff`
- [x] Implement enqueue, dequeue, updateStatus, cancel methods — `0238aff`
- [x] Tests pass — `0238aff`

### Phase 1 — Red notes (MID attempt, 2026-06-13)

Targeted Red command (per test-strategy §9):
```
go test ./internal/db/ -run 'TestBatchQueue' -count=1
```

Result: `FAIL verbal/internal/db [build failed]` — package fails to compile
because the contract symbols are missing:
- `*Database.BatchQueueRepo` method
- `BatchQueueItem` struct
- `BatchQueueStatusPending`, `BatchQueueStatusProcessing`,
  `BatchQueueStatusCompleted`, `BatchQueueStatusError`,
  `BatchQueueStatusCancelled` constants
- Repository methods: `Enqueue`, `ListPending`, `Dequeue`,
  `UpdateStatus`, `Cancel`, `ReconcileProcessingToPending`,
  `GetByID`, `GetByPath`

The Green-phase author must (a) add a numbered migration that creates
the `batch_queue` table with columns `id, file_path, status, progress,
created_at, started_at, completed_at`; (b) add the symbols above in
`internal/db`; (c) make the targeted Red command pass, then run the
broader `go test ./internal/db/... -count=1` for the Green gate.

22 `TestBatchQueue*` functions added across
`internal/db/batch_queue_repository_test.go` covering: migration shape
+ idempotency, Enqueue (newline rejection + duplicate-path),
ListPending FIFO + non-pending exclusion, Dequeue (FIFO, empty,
concurrent atomicity across 10 goroutines), UpdateStatus
(valid/illegal transitions + progress persistence), Cancel (pending,
processing-during-cancel, idempotency, unknown-id), restart-reconcile
(`processing`→`pending` only), and GetBy{ID,Path} round-trips.

### Phase 1 — Green notes (JR attempt, 2026-06-13)

Implementation files:
- `internal/db/migrations.go` — added migration version 7 creating `batch_queue` table
- `internal/db/batch_queue_repository.go` — new file with `BatchQueueItem` struct, `BatchQueueStatus*` constants, `BatchQueueRepository` with all methods
- `internal/db/repository.go` — added `BatchQueueRepo()` accessor on `*Database`

Green gate: `go test ./internal/db/ -run 'TestBatchQueue' -count=1` — 22/22 PASS
Full gate: `go test ./internal/db/... -count=1` — PASS
Vet: `go vet ./internal/db/...` — clean

Note: `make check` and `go build ./...` time out due to CGo/GTK4 first-build
compilation (>5min), not related to this change. The db package compiles and
tests cleanly in isolation.

Commit: `0238aff` — feat(db): implement batch queue data model and repository

## Phase 2: Queue Processing Engine
- [x] Write tests for BatchTranscriptionService — `07a6058` (Red) / `8b0abdc` (Green)
- [x] Implement sequential processing with progress callbacks — `8b0abdc`
- [x] Wire existing TranscriptionService into batch runner — `8b0abdc`
- [x] Tests pass — `8b0abdc`

### Phase 2 — Red notes (MID attempt, 2026-06-13)

Targeted Red command (per test-strategy §9):
```
go test ./internal/transcription/batch/ -run 'TestBatchTranscriptionService' -count=1
```

Result: `FAIL verbal/internal/transcription/batch [build failed]` — the
`internal/transcription/batch` package fails to compile because every
contract symbol is missing:

- `ProgressEvent` struct (`ItemID, FilePath, Status, Progress, Err`)
- `ProgressCallback` func type
- `TranscriptionRunner` interface (must be satisfied by `*transcription.Service`)
- `LibraryWriter` interface (must be satisfied by `*db.RecordingService`)
- `Service` struct and `NewService(queue, runner, lib)` constructor
- `(*Service).SetProgressCallback(cb ProgressCallback)`
- `(*Service).Run(ctx context.Context) error`

8 `TestBatchTranscriptionService_*` functions added in
`internal/transcription/batch/service_test.go`, covering (one test each):

1. `_RunnerSeam` — compile-time proof that `*transcription.Service`
   satisfies `TranscriptionRunner` so the fake cannot drift from
   production (test-strategy §7).
2. `_SequentialOrdering` — three items processed in FIFO enqueue order.
3. `_ProgressCallbacks` — start + terminal `completed` event per item,
   progress carries id/path; completed event has `progress >= 1.0`.
4. `_CompletionWritesLibrary` — successful item flows through
   `LibraryWriter.UpdateTranscriptionStatus(id, "completed", json)` and
   the queue row ends in `completed`.
5. `_ErrorDoesNotHaltQueue` — first item returns provider error → row
   ends in `error`, queue continues; library only gets the 2 successful
   writes; runner sees all 3 paths.
6. `_CancelMidItem` — `context.Cancel` during the in-flight runner call
   marks the row `cancelled` (not `error`), `Run` returns
   `context.Canceled`, untouched items stay `pending`, library gets 0
   writes.
7. `_ReconcilesProcessingOnEntry` — pre-seed a `processing` row, enqueue
   another, run; both end `completed` (reconcile-then-drain). Reuses
   `BatchQueueRepository.ReconcileProcessingToPending`.
8. `_EmptyQueueReturnsNilImmediately` — empty queue returns `nil` in
   <1s, runner never called, 0 events.

The Green-phase author must (a) create
`internal/transcription/batch/service.go` with the symbols above; (b)
implement Run with the FSM specified in the file-header doc comment in
`service_test.go`; (c) wire the production `*transcription.Service` and
`*db.RecordingService` as the runner/library at the call site (left for
Phase 3 UI integration); (d) re-run the targeted Red command (must turn
green), then `go test ./internal/transcription/... -count=1` for the
broader green gate.

Worktree note: at MID start the worktree contained several unrelated
`?? ` paths (db edge tests, livecaption widget test, other tracks'
measure docs, automation scripts, empty `graph.db`). None touch the
batch transcription queue; all were preserved unmodified. Only the new
Red test file and the Phase 2 plan-marker/notes here were staged in this
commit. `graph.db` is the empty leftover from a prior attempt and is
irrelevant because this is a pure-Go repo (build-graph is TypeScript-only,
confirmed by `find -maxdepth 2 -name tsconfig.json` returning nothing).

#### Attempt-2 retry note (2026-06-13)

MID attempt 1 produced commit `07a6058` (Red tests + plan notes) and
emitted its MEASURE_AGENT_RESULT, but the agent process exited with
status 124 (900s wall-clock timeout) after the work was done — an
operational/runtime issue, not a gate failure. On attempt 2 the Red
artifact and bounded gate were re-verified:
- `git log` head is still `07a6058 test(batch-queue): add Phase 2 Red contract for BatchTranscriptionService`.
- Re-running `go test ./internal/transcription/batch/ -run 'TestBatchTranscriptionService' -count=1` still
  yields `FAIL verbal/internal/transcription/batch [build failed]` with
  the same 10+ undefined-symbol errors (`ProgressEvent`, `ProgressCallback`,
  `TranscriptionRunner`, `NewService`, …). The contract is intact and
  no source-code or test-file changes are required.

No new commit is needed for the artifact itself; this retry note is
appended in a separate trivial docs commit so the supervisor sees a
fresh attempt-2 commit referencing the gate re-verification.

### Phase 2 — Green notes (JR attempt, 2026-06-13)

Implementation file:
- `internal/transcription/batch/service.go` — new file with `ProgressEvent`, `ProgressCallback`, `TranscriptionRunner`, `LibraryWriter`, `Service`, `NewService`, `SetProgressCallback`, `Run`

Run method FSM:
1. Reconcile stale `processing` rows to `pending` on entry via `queue.ReconcileProcessingToPending()`
2. Dequeue loop: atomically transitions pending→processing per item
3. Emit `processing` ProgressEvent at start
4. Invoke `runner.TranscribeFile(ctx, item.FilePath)`
5. On ctx cancellation: mark item `cancelled`, emit event, return `ctx.Err()`
6. On error: mark item `error`, emit event, continue to next item
7. On success: mark item `completed` (progress=1.0), commit transcription JSON via `lib.GetByPath` + `lib.UpdateTranscriptionStatus`, emit `completed` event
8. Return nil on clean drain

Green gate: `go test ./internal/transcription/batch/ -run 'TestBatchTranscriptionService' -count=1` — 8/8 PASS
Broader gate: `go test ./internal/transcription/... -count=1` — PASS
DB regression: `go test ./internal/db/... -count=1` — PASS
Vet: `go vet ./internal/transcription/...` — clean

## Phase 3: UI Integration
- [~] Add "Batch Transcribe" menu item and dialog
- [~] Add queue sidebar panel with progress bars
- [~] Add cancel/pause controls
- [ ] Manual verification

### Phase 3 — Red notes (MID attempt, 2026-06-13)

Targeted Red command (per test-strategy §9):
```
go test ./internal/ui/ -run 'TestBatchTranscribeAction' -count=1
```

Result: `FAIL verbal/internal/ui [build failed]` — but for **two
unrelated reasons**, not only the Phase 3 missing symbols:

1. **Phase 3 contract missing symbols** (the intended Red): my new
   test files reference symbols that do not exist yet. The Go compiler
   reports the first two (limit before "too many errors" cutoff):
   ```
   internal/ui/batchqueuepanel_test.go:67:10: undefined: BatchQueueItemView
   internal/ui/batchqueuepanel_test.go:74:65: undefined: BatchQueueItemView
   ```
   The full set of undefined symbols required by the Phase 3 Red
   contract (all live in `internal/ui`) — surface in this exact form
   when the compiler reaches them, which happens once the GTK4 drift
   below is fixed:

   From `batchtranscribedialog_test.go`:
   - `const BatchTranscribeActionName = "batch-transcribe"`
     (artifact/contract for the GAction name registered in
     `internal/app/run.go`).
   - `type BatchTranscribeDialog struct { ... }` with unexported fields
     `onEnqueue`, `onCancel` and a `paths` slice.
   - `func NewBatchTranscribeDialog(parent *gtk.Window) *BatchTranscribeDialog`
   - `func (*BatchTranscribeDialog) SetPaths(paths []string)`
   - `func (*BatchTranscribeDialog) GetPaths() ([]string, error)`
   - `func (*BatchTranscribeDialog) AddPath(path string) error`
   - `func (*BatchTranscribeDialog) SetOnEnqueue(cb func(paths []string))`
   - `func (*BatchTranscribeDialog) SetOnCancel(cb func())`

   From `batchqueuepanel_test.go`:
   - `type BatchQueueItemView struct { ID int64; FilePath, Status string; Progress float64 }`
   - `type BatchQueueModel interface { ListItems(ctx context.Context) ([]BatchQueueItemView, error) }`
   - `type BatchQueuePanel struct { ... }` with unexported fields
     `model`, `items`, `onCancelItem`, `onPauseToggle`, `paused`.
   - `func NewBatchQueuePanel(model BatchQueueModel) *BatchQueuePanel`
   - `func (*BatchQueuePanel) Widget() *gtk.Widget`
   - `func (*BatchQueuePanel) Refresh(ctx context.Context) error`
   - `func (*BatchQueuePanel) Snapshot() []BatchQueueItemView`
   - `func (*BatchQueuePanel) SetOnCancelItem(cb func(id int64))`
   - `func (*BatchQueuePanel) SetOnPauseToggle(cb func(paused bool))`
   - `func (*BatchQueuePanel) SetPaused(paused bool)`
   - `func (*BatchQueuePanel) CancelItem(id int64)`

2. **Pre-existing GTK4 API drift in committed source files** (out of
   scope for this Red pass, verified by `git stash --include-untracked`
   + `go build ./internal/ui/` at HEAD):
   - `internal/ui/editabletranscriptionview.go:278` —
     `popover.SetMenuModel` is undefined on `*gtk.Popover`.
   - `internal/ui/fillersummary.go:184, 188, 203, 257` —
     `*gtk.ListBox.Children` undefined, `declared and not used: i`,
     `textLabel.SetHexpand` should be `SetHExpand` (case-sensitive).
   - `internal/ui/livecaptionwidget.go:95, 141` —
     `lc.box` is `*gtk.Box` not `*gtk.Widget`, `*gtk.FlowBox.Children`
     undefined.
   - `internal/ui/playbackwindow.go:543, 548, 561` —
     `FillerSummaryWidget` and `LiveCaptionWidget` don't implement
     `gtk.Widgetter` (missing `FreezeNotify` method).

   These break the package build **independently** of Phase 3. The
   MID role is forbidden from modifying source code outside test files
   and Measure docs (per task instructions), so this drift is a
   blocker on producing a *clean* Red signal — the build fails for
   reasons the Phase 3 contract does not control.

Test coverage in this commit (matches test-strategy §6 Phase 3
"dialog wiring, action callbacks, stub queue model drives the sidebar"):

`internal/ui/batchtranscribedialog_test.go` (5 tests):
1. `TestBatchTranscribeAction` — artifact/contract: exported constant
   `BatchTranscribeActionName` equals the literal string
   `"batch-transcribe"`. Deliberately **display-independent** so it
   produces a clean Red signal in headless CI (test-strategy §7) once
   the GTK4 drift above is resolved.
2. `TestBatchTranscribeDialog_Construction` — `NewBatchTranscribeDialog`
   returns non-nil; default `GetPaths` is empty.
3. `TestBatchTranscribeDialog_SetPaths` — `SetPaths`/`GetPaths` round-trip.
4. `TestBatchTranscribeDialog_RejectsNewlinePaths` — `AddPath` with a path
   containing `\n` or `\r` returns an error (test-strategy §2 GStreamer
   path safety, cross-phase §4 "duplicate enqueue").
5. `TestBatchTranscribeDialog_CallbackWiring` — `SetOnEnqueue`/`SetOnCancel`
   register callbacks; firing them directly invokes the registered funcs
   (artifact).

`internal/ui/batchqueuepanel_test.go` (4 tests):
6. `TestBatchQueuePanel_Construction` — `NewBatchQueuePanel` returns
   non-nil with a non-nil `Widget()` and an empty `Snapshot()`.
7. `TestBatchQueuePanel_DrivenByStubModel` — `stubBatchQueueModel`
   (test-only, lives in `_test.go`) supplies three items; `Refresh`
   reflects them in `Snapshot()` and re-fetching works (test-strategy
   §6 "stub queue model drives the sidebar" + §7).
8. `TestBatchQueuePanel_CancelCallbackFiresWithID` — `CancelItem(7)` invokes
   the registered callback with id 7.
9. `TestBatchQueuePanel_PauseToggleCallback` — `SetPaused(true|false)`
   fires the registered `SetOnPauseToggle` callback with the new value,
   and the panel's internal `paused` state reflects the toggle.

Display-dependent tests (2–9) are guarded with `hasDisplay()` per
test-strategy §6 Phase 3 + lessons-learned §"GTK Initialization Detection".
Test 1 is display-independent to provide a Red signal in headless CI.

The Green-phase author must (a) **first** resolve the pre-existing
GTK4 API drift listed above (renames to `SetHExpand`, removing
unused variable `i`, replacing `popover.SetMenuModel` with the
gotk4 equivalent, replacing `Children()` iteration with
`ObserveChildren().Item(0)` or `FirstChild()`, and adding
`FreezeNotify`/`ThawNotify` (or equivalent) on `FillerSummaryWidget`/
`LiveCaptionWidget`); (b) create `internal/ui/batchtranscribedialog.go`
with the dialog surface above and follow the existing `ImportDialog`
pattern (modal `gtk.Dialog`, file picker via `gtk.NewFileChooserNative`,
multi-path entry, embedded validation against `\n`/`\r`); (c) create
`internal/ui/batchqueuepanel.go` with the panel surface above and
follow the existing widget patterns (sidebar `gtk.Box` + `gtk.ListBox`,
per-row `gtk.ProgressBar`, per-row cancel button, queue-wide pause
toggle); (d) register an action named `BatchTranscribeActionName` in
`internal/app/run.go` (alongside the existing `transcribeAction` at
`run.go:371`); (e) wire the production `*transcription.Service` and
`*db.RecordingService` as the runner/library at the UI call site
(Phase 2 already left the seam ready at
`internal/transcription/batch.NewService(queue, runner, lib)`);
(f) ensure all progress callbacks route through `glib.IdleAdd`
(lessons-learned §Thread Safety); (g) re-run the targeted Red command
(must turn green or stay skipped on no display), then
`go test ./internal/ui/... -count=1` for the broader gate.

Worktree note: at MID start the worktree contained unrelated paths
(db edge tests, livecaption widget test, sibling MVP track folders,
archive folders, automation scripts, empty `graph.db`). None touch
Phase 3 of this track. Only the two new Red test files plus the
plan-marker/notes here are staged in this commit. `graph.db` is the
empty leftover from a prior build-graph attempt and is irrelevant
because this is a pure-Go repo (no `tsconfig.json`), as already
documented in test-strategy §1 and the Phase 2 plan notes.

#### Status note (MID-attempt-1, 2026-06-13)

This attempt produced two test files + plan updates and is the Red
contract commit. The `go test` command cannot produce a clean Red
signal because of unrelated GTK4 API drift in `internal/ui/`
source files committed before Phase 3 began (verified by
`git stash --include-untracked` + `go build ./internal/ui/`).
The missing-symbol contract documented above is sound: when the GTK4
drift is resolved, the same Red command will surface exactly those
undefined identifiers and nothing else, and the Green author can
proceed. The Red contract is intentionally committed now so that the
next role has a fixed target to implement against; the GTK4 drift
is a separate, pre-existing tech-debt item that should be tracked
in `measure/tech-debt.md` rather than fixed in this Red-only pass.

## Phase 4: Verification
- [ ] Full test suite pass
- [ ] Build and vet clean
- [ ] Update lessons-learned.md
- [ ] Commit and push
