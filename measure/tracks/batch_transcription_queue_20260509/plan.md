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
- [~] Write tests for BatchTranscriptionService
- [~] Implement sequential processing with progress callbacks
- [~] Wire existing TranscriptionService into batch runner
- [~] Tests pass

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

## Phase 3: UI Integration
- [ ] Add "Batch Transcribe" menu item and dialog
- [ ] Add queue sidebar panel with progress bars
- [ ] Add cancel/pause controls
- [ ] Manual verification

## Phase 4: Verification
- [ ] Full test suite pass
- [ ] Build and vet clean
- [ ] Update lessons-learned.md
- [ ] Commit and push
