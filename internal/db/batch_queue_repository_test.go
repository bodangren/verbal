package db

import (
	"context"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// Red-phase contract tests for the Batch Transcription Queue (Phase 1:
// Queue Data Model). See measure/tracks/batch_transcription_queue_20260509/
// test-strategy.md §6 for the test plan and §9 for the targeted Red command.
//
// The Green-phase implementation must add:
//   - a numbered migration that creates the `batch_queue` table with the
//     columns asserted by TestBatchQueueMigration_SchemaShape,
//   - the BatchQueueItem struct, BatchQueueStatus* constants, and the
//     BatchQueueRepository type with the methods exercised below,
//   - a Database.BatchQueueRepo() accessor.
//
// All tests in this file reference symbols that do not exist yet, so the
// package will fail to compile when the targeted Red command runs. That
// is the expected Red outcome. The Green-phase author must make these
// tests pass without removing or weakening any of the contracts below.

func TestBatchQueueMigration_CreatesTable(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	var name string
	if err := database.GetDB().QueryRow(
		`SELECT name FROM sqlite_master WHERE type='table' AND name='batch_queue'`,
	).Scan(&name); err != nil {
		t.Fatalf("expected batch_queue table to exist after Migrate(): %v", err)
	}
	if name != "batch_queue" {
		t.Errorf("expected table name 'batch_queue', got %q", name)
	}
}

func TestBatchQueueMigration_Idempotent(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	for i := 0; i < 3; i++ {
		if err := Migrate(database.GetDB()); err != nil {
			t.Fatalf("Migrate() iteration %d error = %v", i, err)
		}
	}
}

func TestBatchQueueMigration_SchemaShape(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	rows, err := database.GetDB().Query(`PRAGMA table_info(batch_queue)`)
	if err != nil {
		t.Fatalf("PRAGMA table_info(batch_queue): %v", err)
	}
	defer rows.Close()

	got := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull int
		var dfltValue interface{}
		var pk int
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dfltValue, &pk); err != nil {
			t.Fatalf("scan column: %v", err)
		}
		got[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate columns: %v", err)
	}

	required := []string{"id", "file_path", "status", "progress", "created_at", "started_at", "completed_at"}
	for _, col := range required {
		if !got[col] {
			t.Errorf("batch_queue missing required column %q (got %v)", col, got)
		}
	}
}

func TestBatchQueueRepository_Enqueue(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	item, err := repo.Enqueue("/media/clip-a.mp4")
	if err != nil {
		t.Fatalf("Enqueue() error = %v", err)
	}
	if item == nil {
		t.Fatal("Enqueue() returned nil item")
	}
	if item.ID == 0 {
		t.Error("Enqueue() did not populate ID")
	}
	if item.FilePath != "/media/clip-a.mp4" {
		t.Errorf("FilePath = %q, want %q", item.FilePath, "/media/clip-a.mp4")
	}
	if item.Status != BatchQueueStatusPending {
		t.Errorf("Status = %q, want %q", item.Status, BatchQueueStatusPending)
	}
	if item.Progress != 0 {
		t.Errorf("Progress = %v, want 0", item.Progress)
	}
	if item.CreatedAt.IsZero() {
		t.Error("CreatedAt not populated")
	}
	if item.StartedAt != nil {
		t.Errorf("StartedAt = %v, want nil", item.StartedAt)
	}
	if item.CompletedAt != nil {
		t.Errorf("CompletedAt = %v, want nil", item.CompletedAt)
	}
}

func TestBatchQueueRepository_Enqueue_RejectsEmbeddedNewline(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	cases := []string{
		"/media/clip\nbad.mp4",
		"/media/clip\rbad.mp4",
		"/media/clip\r\nbad.mp4",
	}
	for _, path := range cases {
		if _, err := repo.Enqueue(path); err == nil {
			t.Errorf("Enqueue(%q) succeeded, want error for embedded control character", path)
		}
	}
}

func TestBatchQueueRepository_Enqueue_AllowsDuplicatePath(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	first, err := repo.Enqueue("/media/same.mp4")
	if err != nil {
		t.Fatalf("Enqueue(first) error = %v", err)
	}
	second, err := repo.Enqueue("/media/same.mp4")
	if err != nil {
		t.Fatalf("Enqueue(second) error = %v", err)
	}
	if first.ID == second.ID {
		t.Errorf("duplicate enqueue produced same ID %d (want distinct rows)", first.ID)
	}
}

func TestBatchQueueRepository_ListPending_FIFOOrder(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	paths := []string{"/media/a.mp4", "/media/b.mp4", "/media/c.mp4"}
	for _, p := range paths {
		if _, err := repo.Enqueue(p); err != nil {
			t.Fatalf("Enqueue(%q): %v", p, err)
		}
		time.Sleep(2 * time.Millisecond)
	}

	got, err := repo.ListPending()
	if err != nil {
		t.Fatalf("ListPending() error = %v", err)
	}
	if len(got) != len(paths) {
		t.Fatalf("ListPending() returned %d items, want %d", len(got), len(paths))
	}
	for i, item := range got {
		if item.FilePath != paths[i] {
			t.Errorf("ListPending()[%d].FilePath = %q, want %q (FIFO)", i, item.FilePath, paths[i])
		}
		if item.Status != BatchQueueStatusPending {
			t.Errorf("ListPending()[%d].Status = %q, want %q", i, item.Status, BatchQueueStatusPending)
		}
	}
}

func TestBatchQueueRepository_ListPending_ExcludesNonPending(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	pending, err := repo.Enqueue("/media/pending.mp4")
	if err != nil {
		t.Fatalf("Enqueue(pending) error = %v", err)
	}
	processing, err := repo.Enqueue("/media/processing.mp4")
	if err != nil {
		t.Fatalf("Enqueue(processing) error = %v", err)
	}
	completed, err := repo.Enqueue("/media/completed.mp4")
	if err != nil {
		t.Fatalf("Enqueue(completed) error = %v", err)
	}

	if err := repo.UpdateStatus(processing.ID, BatchQueueStatusProcessing, 0.1); err != nil {
		t.Fatalf("UpdateStatus(processing): %v", err)
	}
	if err := repo.UpdateStatus(completed.ID, BatchQueueStatusProcessing, 0.5); err != nil {
		t.Fatalf("UpdateStatus(completed->processing): %v", err)
	}
	if err := repo.UpdateStatus(completed.ID, BatchQueueStatusCompleted, 1.0); err != nil {
		t.Fatalf("UpdateStatus(completed): %v", err)
	}

	got, err := repo.ListPending()
	if err != nil {
		t.Fatalf("ListPending() error = %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("ListPending() = %d items, want 1 (only pending)", len(got))
	}
	if got[0].ID != pending.ID {
		t.Errorf("ListPending()[0].ID = %d, want %d (the pending item)", got[0].ID, pending.ID)
	}
}

func TestBatchQueueRepository_Dequeue_ReturnsNextPending(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	first, err := repo.Enqueue("/media/first.mp4")
	if err != nil {
		t.Fatalf("Enqueue(first) error = %v", err)
	}
	second, err := repo.Enqueue("/media/second.mp4")
	if err != nil {
		t.Fatalf("Enqueue(second) error = %v", err)
	}

	got, err := repo.Dequeue(context.Background())
	if err != nil {
		t.Fatalf("Dequeue() error = %v", err)
	}
	if got == nil {
		t.Fatal("Dequeue() returned nil item")
	}
	if got.ID != first.ID {
		t.Errorf("Dequeue().ID = %d, want %d (FIFO)", got.ID, first.ID)
	}
	if got.Status != BatchQueueStatusProcessing {
		t.Errorf("Dequeue().Status = %q, want %q", got.Status, BatchQueueStatusProcessing)
	}
	if got.StartedAt == nil {
		t.Error("Dequeue().StartedAt = nil, want non-nil")
	}

	relisted, err := repo.ListPending()
	if err != nil {
		t.Fatalf("ListPending() after dequeue: %v", err)
	}
	if len(relisted) != 1 || relisted[0].ID != second.ID {
		t.Errorf("after Dequeue, ListPending should contain only second item, got %+v", relisted)
	}
}

func TestBatchQueueRepository_Dequeue_EmptyQueue(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	got, err := repo.Dequeue(context.Background())
	if err != nil {
		t.Fatalf("Dequeue() on empty queue error = %v, want nil", err)
	}
	if got != nil {
		t.Errorf("Dequeue() on empty queue returned %+v, want nil", got)
	}
}

func TestBatchQueueRepository_Dequeue_Atomicity(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	const N = 10
	enqueued := make(map[int64]bool, N)
	for i := 0; i < N; i++ {
		item, err := repo.Enqueue("/media/atomic.mp4")
		if err != nil {
			t.Fatalf("Enqueue(%d): %v", i, err)
		}
		enqueued[item.ID] = true
	}

	const M = 10
	var wg sync.WaitGroup
	wg.Add(M)
	results := make(chan int64, M)
	for i := 0; i < M; i++ {
		go func() {
			defer wg.Done()
			got, err := repo.Dequeue(context.Background())
			if err != nil {
				t.Errorf("Dequeue() goroutine: %v", err)
				return
			}
			if got == nil {
				return
			}
			results <- got.ID
		}()
	}
	wg.Wait()
	close(results)

	seen := map[int64]int{}
	for id := range results {
		seen[id]++
	}
	if len(seen) != N {
		t.Errorf("Dequeue() returned %d distinct items across %d goroutines, want %d", len(seen), M, N)
	}
	for id, count := range seen {
		if count != 1 {
			t.Errorf("item %d dequeued %d times, want 1 (atomicity violated)", id, count)
		}
		if !enqueued[id] {
			t.Errorf("Dequeue() returned unknown id %d", id)
		}
	}
}

func TestBatchQueueRepository_UpdateStatus_ValidTransitions(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	cases := []struct {
		name   string
		steps  []string
		final  string
		expect *time.Time
	}{
		{"pending->processing->completed", []string{BatchQueueStatusProcessing, BatchQueueStatusCompleted}, BatchQueueStatusCompleted, ptrTime()},
		{"pending->processing->error", []string{BatchQueueStatusProcessing, BatchQueueStatusError}, BatchQueueStatusError, ptrTime()},
		{"pending->cancelled", []string{BatchQueueStatusCancelled}, BatchQueueStatusCancelled, nil},
		{"pending->processing->cancelled", []string{BatchQueueStatusProcessing, BatchQueueStatusCancelled}, BatchQueueStatusCancelled, ptrTime()},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			item, err := repo.Enqueue("/media/" + tc.name + ".mp4")
			if err != nil {
				t.Fatalf("Enqueue: %v", err)
			}
			for i, step := range tc.steps {
				progress := float64(i+1) / float64(len(tc.steps))
				if err := repo.UpdateStatus(item.ID, step, progress); err != nil {
					t.Fatalf("UpdateStatus(step %d = %q): %v", i, step, err)
				}
			}
			got, err := repo.GetByID(item.ID)
			if err != nil {
				t.Fatalf("GetByID: %v", err)
			}
			if got.Status != tc.final {
				t.Errorf("final Status = %q, want %q", got.Status, tc.final)
			}
			if tc.expect == nil && got.CompletedAt != nil {
				t.Errorf("CompletedAt = %v, want nil for %q", got.CompletedAt, tc.final)
			}
			if tc.expect != nil && got.CompletedAt == nil {
				t.Errorf("CompletedAt = nil, want non-nil for terminal status %q", tc.final)
			}
		})
	}
}

func TestBatchQueueRepository_UpdateStatus_RejectsIllegalTransitions(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	illegal := []struct {
		name      string
		setup     []string
		attempted string
	}{
		{"pending->completed", nil, BatchQueueStatusCompleted},
		{"pending->error", nil, BatchQueueStatusError},
		{"pending->pending", nil, BatchQueueStatusPending},
		{"processing->pending", []string{BatchQueueStatusProcessing}, BatchQueueStatusPending},
		{"processing->processing", []string{BatchQueueStatusProcessing}, BatchQueueStatusProcessing},
		{"completed->pending", []string{BatchQueueStatusProcessing, BatchQueueStatusCompleted}, BatchQueueStatusPending},
		{"completed->processing", []string{BatchQueueStatusProcessing, BatchQueueStatusCompleted}, BatchQueueStatusProcessing},
		{"error->pending", []string{BatchQueueStatusProcessing, BatchQueueStatusError}, BatchQueueStatusPending},
		{"cancelled->pending", []string{BatchQueueStatusCancelled}, BatchQueueStatusPending},
	}
	for _, tc := range illegal {
		t.Run(tc.name, func(t *testing.T) {
			item, err := repo.Enqueue("/media/" + tc.name + ".mp4")
			if err != nil {
				t.Fatalf("Enqueue: %v", err)
			}
			for i, step := range tc.setup {
				progress := float64(i+1) / float64(len(tc.setup)+1)
				if err := repo.UpdateStatus(item.ID, step, progress); err != nil {
					t.Fatalf("setup UpdateStatus(%q): %v", step, err)
				}
			}
			if err := repo.UpdateStatus(item.ID, tc.attempted, 0.5); err == nil {
				t.Errorf("UpdateStatus(%q) succeeded, want error (illegal transition from setup %v)", tc.attempted, tc.setup)
			}
		})
	}
}

func TestBatchQueueRepository_UpdateStatus_PersistsProgress(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	item, err := repo.Enqueue("/media/progress.mp4")
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if err := repo.UpdateStatus(item.ID, BatchQueueStatusProcessing, 0.42); err != nil {
		t.Fatalf("UpdateStatus(processing): %v", err)
	}
	got, err := repo.GetByID(item.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Progress != 0.42 {
		t.Errorf("Progress = %v, want 0.42", got.Progress)
	}
}

func TestBatchQueueRepository_Cancel_PendingItem(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	item, err := repo.Enqueue("/media/cancel-pending.mp4")
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if err := repo.Cancel(item.ID); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}
	got, err := repo.GetByID(item.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Status != BatchQueueStatusCancelled {
		t.Errorf("Status = %q, want %q", got.Status, BatchQueueStatusCancelled)
	}
	if got.CompletedAt == nil {
		t.Error("CompletedAt = nil, want non-nil after cancel")
	}
}

func TestBatchQueueRepository_Cancel_ProcessingItemMarksCancelledNotError(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	item, err := repo.Enqueue("/media/cancel-processing.mp4")
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if err := repo.UpdateStatus(item.ID, BatchQueueStatusProcessing, 0.25); err != nil {
		t.Fatalf("UpdateStatus(processing): %v", err)
	}
	if err := repo.Cancel(item.ID); err != nil {
		t.Fatalf("Cancel(): %v", err)
	}
	got, err := repo.GetByID(item.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Status != BatchQueueStatusCancelled {
		t.Errorf("Status = %q, want %q (cancel during processing must not be error)", got.Status, BatchQueueStatusCancelled)
	}
}

func TestBatchQueueRepository_Cancel_Idempotent(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	item, err := repo.Enqueue("/media/cancel-twice.mp4")
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if err := repo.Cancel(item.ID); err != nil {
		t.Fatalf("first Cancel(): %v", err)
	}
	if err := repo.Cancel(item.ID); err != nil {
		t.Errorf("second Cancel() error = %v, want nil (idempotent)", err)
	}
	got, err := repo.GetByID(item.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Status != BatchQueueStatusCancelled {
		t.Errorf("Status = %q, want %q", got.Status, BatchQueueStatusCancelled)
	}
}

func TestBatchQueueRepository_Cancel_UnknownIDReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()
	if err := repo.Cancel(9999); err == nil {
		t.Error("Cancel(9999) returned nil error, want error for unknown id")
	}
}

func TestBatchQueueRepository_ReconcileProcessingToPending(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	processing, err := repo.Enqueue("/media/orphan-processing.mp4")
	if err != nil {
		t.Fatalf("Enqueue(processing): %v", err)
	}
	completed, err := repo.Enqueue("/media/already-completed.mp4")
	if err != nil {
		t.Fatalf("Enqueue(completed): %v", err)
	}
	cancelled, err := repo.Enqueue("/media/already-cancelled.mp4")
	if err != nil {
		t.Fatalf("Enqueue(cancelled): %v", err)
	}
	freshPending, err := repo.Enqueue("/media/still-pending.mp4")
	if err != nil {
		t.Fatalf("Enqueue(fresh-pending): %v", err)
	}

	if err := repo.UpdateStatus(processing.ID, BatchQueueStatusProcessing, 0.5); err != nil {
		t.Fatalf("UpdateStatus(processing): %v", err)
	}
	if err := repo.UpdateStatus(completed.ID, BatchQueueStatusProcessing, 0.5); err != nil {
		t.Fatalf("UpdateStatus(completed->processing): %v", err)
	}
	if err := repo.UpdateStatus(completed.ID, BatchQueueStatusCompleted, 1.0); err != nil {
		t.Fatalf("UpdateStatus(completed): %v", err)
	}
	if err := repo.Cancel(cancelled.ID); err != nil {
		t.Fatalf("Cancel(cancelled): %v", err)
	}

	reconciled, err := repo.ReconcileProcessingToPending()
	if err != nil {
		t.Fatalf("ReconcileProcessingToPending() error = %v", err)
	}
	if reconciled != 1 {
		t.Errorf("ReconcileProcessingToPending() reconciled %d rows, want 1 (only the orphan processing item)", reconciled)
	}

	check := func(id int64, want string) {
		t.Helper()
		got, err := repo.GetByID(id)
		if err != nil {
			t.Fatalf("GetByID(%d): %v", id, err)
		}
		if got.Status != want {
			t.Errorf("item %d: Status = %q, want %q", id, got.Status, want)
		}
	}
	check(processing.ID, BatchQueueStatusPending)
	check(completed.ID, BatchQueueStatusCompleted)
	check(cancelled.ID, BatchQueueStatusCancelled)
	check(freshPending.ID, BatchQueueStatusPending)

	again, err := repo.ReconcileProcessingToPending()
	if err != nil {
		t.Fatalf("ReconcileProcessingToPending() second call: %v", err)
	}
	if again != 0 {
		t.Errorf("second Reconcile reconciled %d rows, want 0 (idempotent)", again)
	}
}

func TestBatchQueueRepository_GetByID_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()
	if _, err := repo.GetByID(9999); err == nil {
		t.Error("GetByID(9999) returned nil error, want error for unknown id")
	}
}

func TestBatchQueueRepository_GetByPath_RoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()

	want, err := repo.Enqueue("/media/roundtrip.mp4")
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if _, err := repo.Enqueue("/media/other.mp4"); err != nil {
		t.Fatalf("Enqueue(other): %v", err)
	}

	got, err := repo.GetByPath("/media/roundtrip.mp4")
	if err != nil {
		t.Fatalf("GetByPath: %v", err)
	}
	if got.ID != want.ID {
		t.Errorf("GetByPath().ID = %d, want %d", got.ID, want.ID)
	}
	if got.FilePath != "/media/roundtrip.mp4" {
		t.Errorf("GetByPath().FilePath = %q, want %q", got.FilePath, "/media/roundtrip.mp4")
	}
}

func TestBatchQueueRepository_GetByPath_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.BatchQueueRepo()
	if _, err := repo.GetByPath("/does/not/exist.mp4"); err == nil {
		t.Error("GetByPath(/does/not/exist.mp4) returned nil error, want error")
	}
}

func ptrTime() *time.Time {
	now := time.Now()
	return &now
}
