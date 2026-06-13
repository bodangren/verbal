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
- [ ] Write tests for BatchTranscriptionService
- [ ] Implement sequential processing with progress callbacks
- [ ] Wire existing TranscriptionService into batch runner
- [ ] Tests pass

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
