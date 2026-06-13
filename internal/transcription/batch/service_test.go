package batch

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"verbal/internal/ai"
	"verbal/internal/db"
	"verbal/internal/transcription"
)

// Red-phase contract tests for the Batch Transcription Queue (Phase 2:
// Queue Processing Engine). See
// measure/tracks/batch_transcription_queue_20260509/test-strategy.md §3
// (fakes), §4 (cross-phase edge cases) and §6 / §9 (per-phase test plan
// and targeted Red command).
//
// The Green-phase implementation must add an `internal/transcription/batch`
// package with at minimum:
//
//   - type ProgressEvent struct { ItemID int64; FilePath, Status string;
//                                 Progress float64; Err error }
//   - type ProgressCallback func(ProgressEvent)
//   - type TranscriptionRunner interface {
//         TranscribeFile(ctx context.Context, path string) (*ai.TranscriptionResult, error)
//     }
//   - type LibraryWriter interface {
//         GetByPath(filePath string) (*db.Recording, error)
//         UpdateTranscriptionStatus(id int64, status, transcriptionJSON string) error
//     }
//   - type Service struct { ... } with constructor
//         NewService(queue *db.BatchQueueRepository,
//                    runner TranscriptionRunner,
//                    lib LibraryWriter) *Service
//   - method (*Service).SetProgressCallback(cb ProgressCallback)
//   - method (*Service).Run(ctx context.Context) error
//
// The Run method must:
//   (1) call queue.ReconcileProcessingToPending() on entry,
//   (2) drain pending items in FIFO order via queue.Dequeue,
//   (3) invoke runner.TranscribeFile(ctx, item.FilePath) per item,
//   (4) emit ProgressEvents at start, on completion, and on error/cancel,
//   (5) persist terminal state via queue.UpdateStatus,
//   (6) on success, look up the recording by path via lib.GetByPath and
//       commit the transcription JSON via lib.UpdateTranscriptionStatus,
//   (7) NOT halt the queue when a single item errors,
//   (8) honour ctx cancellation: the in-flight item must be marked
//       cancelled (not error), Run must return ctx.Err(), and no further
//       items may be processed,
//   (9) return nil on a clean drain.
//
// All tests in this file reference symbols that do not exist yet, so the
// package will fail to compile when the targeted Red command runs. That
// is the expected Red outcome. The Green-phase author must make these
// tests pass without removing or weakening any of the contracts below.

// --- Fakes -----------------------------------------------------------------

// fakeRunner is a test seam standing in for *transcription.Service. It
// records the order of calls and supports per-call error injection plus a
// blocking hook for cancellation tests. It is the ONLY production-shaped
// fake in this package and lives exclusively in _test.go, so `go vet`
// and `go build ./...` will reject any leak into a non-test file.
type fakeRunner struct {
	mu     sync.Mutex
	calls  []string
	result *ai.TranscriptionResult
	// perPathError lets a test inject an error for a specific input path.
	perPathError map[string]error
	// beforeReturn, if non-nil, runs (with the path argument) before the
	// runner returns. Used to coordinate cancellation tests by blocking
	// until ctx is cancelled.
	beforeReturn func(ctx context.Context, path string) error
}

func (f *fakeRunner) TranscribeFile(ctx context.Context, path string) (*ai.TranscriptionResult, error) {
	f.mu.Lock()
	f.calls = append(f.calls, path)
	hook := f.beforeReturn
	injected := f.perPathError[path]
	res := f.result
	f.mu.Unlock()

	if hook != nil {
		if err := hook(ctx, path); err != nil {
			return nil, err
		}
	}
	if injected != nil {
		return nil, injected
	}
	if res == nil {
		res = &ai.TranscriptionResult{Text: "ok", Language: "en", Duration: 1.0}
	}
	return res, nil
}

func (f *fakeRunner) callOrder() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, len(f.calls))
	copy(out, f.calls)
	return out
}

// fakeLibrary captures UpdateTranscriptionStatus calls so tests can verify
// completion writes through the existing RecordingService surface
// (test-strategy §6).
type fakeLibrary struct {
	mu             sync.Mutex
	recordings     map[string]*db.Recording
	statusCalls    []libraryStatusCall
	getByPathError error
	updateError    error
}

type libraryStatusCall struct {
	ID                int64
	Status            string
	TranscriptionJSON string
}

func (l *fakeLibrary) GetByPath(filePath string) (*db.Recording, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.getByPathError != nil {
		return nil, l.getByPathError
	}
	rec, ok := l.recordings[filePath]
	if !ok {
		return nil, errors.New("library: recording not found")
	}
	return rec, nil
}

func (l *fakeLibrary) UpdateTranscriptionStatus(id int64, status, transcriptionJSON string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.statusCalls = append(l.statusCalls, libraryStatusCall{
		ID:                id,
		Status:            status,
		TranscriptionJSON: transcriptionJSON,
	})
	return l.updateError
}

func (l *fakeLibrary) statuses() []libraryStatusCall {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]libraryStatusCall, len(l.statusCalls))
	copy(out, l.statusCalls)
	return out
}

// --- Fixtures --------------------------------------------------------------

// newTestQueue opens a fresh on-disk SQLite, runs migrations, and returns
// the BatchQueueRepository plus the underlying *db.Database for paths that
// need RecordingRepo/RecordingService access. Cleanup is registered via
// t.Cleanup. (test-strategy §3 tempDB pattern.)
func newTestQueue(t *testing.T) (*db.BatchQueueRepository, *db.Database) {
	t.Helper()
	dir := t.TempDir()
	database, err := db.NewDatabase(filepath.Join(dir, "batch.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database.BatchQueueRepo(), database
}

// drainEvents collects all ProgressEvents observed during a Run call.
func drainEvents() (*sync.Mutex, *[]ProgressEvent, ProgressCallback) {
	var mu sync.Mutex
	events := make([]ProgressEvent, 0, 16)
	cb := func(ev ProgressEvent) {
		mu.Lock()
		events = append(events, ev)
		mu.Unlock()
	}
	return &mu, &events, cb
}

// --- Tests -----------------------------------------------------------------

// TestBatchTranscriptionService_RunnerSeam is a compile-time assertion
// that the production *transcription.Service satisfies the package's
// TranscriptionRunner interface. If this stops compiling, the seam has
// drifted from production and the fake above is no longer
// representative. (test-strategy §7 live-behavior gate: fakes must not
// diverge from production.)
func TestBatchTranscriptionService_RunnerSeam(t *testing.T) {
	var _ TranscriptionRunner = (*transcription.Service)(nil)
}

// TestBatchTranscriptionService_SequentialOrdering enqueues three items
// and verifies that the runner observes them in enqueue (FIFO) order.
// (test-strategy §6 Phase 2.)
func TestBatchTranscriptionService_SequentialOrdering(t *testing.T) {
	queue, database := newTestQueue(t)

	paths := []string{"/tmp/batch/one.wav", "/tmp/batch/two.wav", "/tmp/batch/three.wav"}
	lib := &fakeLibrary{recordings: map[string]*db.Recording{}}
	for _, p := range paths {
		if _, err := queue.Enqueue(p); err != nil {
			t.Fatalf("Enqueue(%q): %v", p, err)
		}
		rec, err := database.RecordingRepo().GetByPathExact(p)
		if err != nil {
			rec = &db.Recording{ID: int64(len(lib.recordings) + 1), FilePath: p}
		}
		lib.recordings[p] = rec
	}

	runner := &fakeRunner{}
	svc := NewService(queue, runner, lib)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := svc.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}

	got := runner.callOrder()
	if len(got) != len(paths) {
		t.Fatalf("runner saw %d calls, want %d (calls=%v)", len(got), len(paths), got)
	}
	for i, p := range paths {
		if got[i] != p {
			t.Errorf("call %d = %q, want %q", i, got[i], p)
		}
	}
}

// TestBatchTranscriptionService_ProgressCallbacks asserts that the
// service emits at least one "start" event and exactly one terminal
// "completed" event per item, and that every event carries the right
// item ID and file path. (test-strategy §6.)
func TestBatchTranscriptionService_ProgressCallbacks(t *testing.T) {
	queue, _ := newTestQueue(t)

	paths := []string{"/tmp/batch/a.wav", "/tmp/batch/b.wav"}
	lib := &fakeLibrary{recordings: map[string]*db.Recording{
		paths[0]: {ID: 11, FilePath: paths[0]},
		paths[1]: {ID: 12, FilePath: paths[1]},
	}}
	ids := make([]int64, 0, len(paths))
	for _, p := range paths {
		item, err := queue.Enqueue(p)
		if err != nil {
			t.Fatalf("Enqueue: %v", err)
		}
		ids = append(ids, item.ID)
	}

	runner := &fakeRunner{result: &ai.TranscriptionResult{Text: "hi", Language: "en", Duration: 0.5}}
	svc := NewService(queue, runner, lib)

	mu, events, cb := drainEvents()
	svc.SetProgressCallback(cb)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := svc.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}

	mu.Lock()
	observed := append([]ProgressEvent(nil), (*events)...)
	mu.Unlock()

	if len(observed) < 2*len(paths) {
		t.Fatalf("expected at least %d events (one start + one completed per item), got %d (%v)",
			2*len(paths), len(observed), observed)
	}

	completedByItem := map[int64]int{}
	pathSeen := map[string]bool{}
	for _, ev := range observed {
		if ev.FilePath == "" {
			t.Errorf("event missing FilePath: %+v", ev)
		}
		pathSeen[ev.FilePath] = true
		if ev.Status == db.BatchQueueStatusCompleted {
			completedByItem[ev.ItemID]++
			if ev.Progress < 1.0 {
				t.Errorf("completed event progress = %v, want >=1.0 (item %d)", ev.Progress, ev.ItemID)
			}
		}
	}
	for _, id := range ids {
		if completedByItem[id] != 1 {
			t.Errorf("item %d completed events = %d, want 1", id, completedByItem[id])
		}
	}
	for _, p := range paths {
		if !pathSeen[p] {
			t.Errorf("no event observed for path %q", p)
		}
	}
}

// TestBatchTranscriptionService_CompletionWritesLibrary verifies that on
// successful transcription the service commits results through the
// LibraryWriter seam (production: *db.RecordingService.
// UpdateTranscriptionStatus). (test-strategy §6 + cross-phase §4 "library
// write race".)
func TestBatchTranscriptionService_CompletionWritesLibrary(t *testing.T) {
	queue, _ := newTestQueue(t)

	const path = "/tmp/batch/commit.wav"
	rec := &db.Recording{ID: 99, FilePath: path}
	lib := &fakeLibrary{recordings: map[string]*db.Recording{path: rec}}

	item, err := queue.Enqueue(path)
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	runner := &fakeRunner{result: &ai.TranscriptionResult{
		Text:     "committed transcript",
		Language: "en",
		Duration: 2.5,
	}}
	svc := NewService(queue, runner, lib)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := svc.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}

	calls := lib.statuses()
	if len(calls) != 1 {
		t.Fatalf("UpdateTranscriptionStatus called %d times, want 1 (calls=%+v)", len(calls), calls)
	}
	if calls[0].ID != rec.ID {
		t.Errorf("UpdateTranscriptionStatus id = %d, want %d", calls[0].ID, rec.ID)
	}
	if calls[0].Status != db.BatchQueueStatusCompleted && calls[0].Status != "completed" {
		t.Errorf("UpdateTranscriptionStatus status = %q, want %q", calls[0].Status, db.BatchQueueStatusCompleted)
	}
	if !strings.Contains(calls[0].TranscriptionJSON, "committed transcript") {
		t.Errorf("UpdateTranscriptionStatus payload does not include transcript text; got %q",
			calls[0].TranscriptionJSON)
	}

	stored, err := queue.GetByID(item.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if stored.Status != db.BatchQueueStatusCompleted {
		t.Errorf("queue item status = %q, want %q", stored.Status, db.BatchQueueStatusCompleted)
	}
}

// TestBatchTranscriptionService_ErrorDoesNotHaltQueue verifies that a
// single failing item leaves subsequent items intact and the queue
// continues to drain. (test-strategy §4 + §6.)
func TestBatchTranscriptionService_ErrorDoesNotHaltQueue(t *testing.T) {
	queue, _ := newTestQueue(t)

	paths := []string{"/tmp/batch/err.wav", "/tmp/batch/ok1.wav", "/tmp/batch/ok2.wav"}
	lib := &fakeLibrary{recordings: map[string]*db.Recording{
		paths[0]: {ID: 1, FilePath: paths[0]},
		paths[1]: {ID: 2, FilePath: paths[1]},
		paths[2]: {ID: 3, FilePath: paths[2]},
	}}
	itemIDs := make([]int64, 0, len(paths))
	for _, p := range paths {
		it, err := queue.Enqueue(p)
		if err != nil {
			t.Fatalf("Enqueue: %v", err)
		}
		itemIDs = append(itemIDs, it.ID)
	}

	runner := &fakeRunner{
		perPathError: map[string]error{
			paths[0]: errors.New("transient provider failure"),
		},
	}
	svc := NewService(queue, runner, lib)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := svc.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}

	if len(runner.callOrder()) != len(paths) {
		t.Fatalf("runner saw %d calls, want %d", len(runner.callOrder()), len(paths))
	}

	first, err := queue.GetByID(itemIDs[0])
	if err != nil {
		t.Fatalf("GetByID(err item): %v", err)
	}
	if first.Status != db.BatchQueueStatusError {
		t.Errorf("err item status = %q, want %q", first.Status, db.BatchQueueStatusError)
	}
	for _, id := range itemIDs[1:] {
		it, err := queue.GetByID(id)
		if err != nil {
			t.Fatalf("GetByID(%d): %v", id, err)
		}
		if it.Status != db.BatchQueueStatusCompleted {
			t.Errorf("item %d status = %q, want %q", id, it.Status, db.BatchQueueStatusCompleted)
		}
	}

	calls := lib.statuses()
	if len(calls) != 2 {
		t.Errorf("library got %d completion writes, want 2 (failed item must NOT call UpdateTranscriptionStatus)", len(calls))
	}
}

// TestBatchTranscriptionService_CancelMidItem verifies that ctx
// cancellation during a runner call marks the in-flight item as
// "cancelled" (not "error"), returns ctx.Err() from Run, and prevents
// any further items from being dequeued. (test-strategy §4 cross-phase
// "cancel races" and §6.)
func TestBatchTranscriptionService_CancelMidItem(t *testing.T) {
	queue, _ := newTestQueue(t)

	paths := []string{"/tmp/batch/blocking.wav", "/tmp/batch/never.wav"}
	lib := &fakeLibrary{recordings: map[string]*db.Recording{
		paths[0]: {ID: 1, FilePath: paths[0]},
		paths[1]: {ID: 2, FilePath: paths[1]},
	}}
	itemIDs := make([]int64, 0, len(paths))
	for _, p := range paths {
		it, err := queue.Enqueue(p)
		if err != nil {
			t.Fatalf("Enqueue: %v", err)
		}
		itemIDs = append(itemIDs, it.ID)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	started := make(chan struct{})
	runner := &fakeRunner{
		beforeReturn: func(rCtx context.Context, _ string) error {
			close(started)
			<-rCtx.Done()
			return rCtx.Err()
		},
	}
	svc := NewService(queue, runner, lib)

	runErr := make(chan error, 1)
	go func() { runErr <- svc.Run(ctx) }()

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("runner did not start within 2s")
	}
	cancel()

	select {
	case err := <-runErr:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Run err = %v, want context.Canceled", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return within 2s of cancellation")
	}

	if order := runner.callOrder(); len(order) != 1 || order[0] != paths[0] {
		t.Errorf("runner saw calls=%v, want exactly [%q] (cancel must stop further dequeue)",
			order, paths[0])
	}

	first, err := queue.GetByID(itemIDs[0])
	if err != nil {
		t.Fatalf("GetByID(blocking item): %v", err)
	}
	if first.Status != db.BatchQueueStatusCancelled {
		t.Errorf("cancelled item status = %q, want %q (not %q)",
			first.Status, db.BatchQueueStatusCancelled, db.BatchQueueStatusError)
	}

	second, err := queue.GetByID(itemIDs[1])
	if err != nil {
		t.Fatalf("GetByID(untouched item): %v", err)
	}
	if second.Status != db.BatchQueueStatusPending {
		t.Errorf("untouched item status = %q, want %q (cancel must not dequeue subsequent items)",
			second.Status, db.BatchQueueStatusPending)
	}

	if calls := lib.statuses(); len(calls) != 0 {
		t.Errorf("library got %d writes, want 0 (cancelled item must not commit)", len(calls))
	}
}

// TestBatchTranscriptionService_ReconcilesProcessingOnEntry verifies the
// startup invariant: any row left in "processing" from a crashed prior
// run is reconciled to "pending" before the new Run begins, so it gets
// processed during this drain. (test-strategy §4 "App restart mid-queue"
// + §6.)
func TestBatchTranscriptionService_ReconcilesProcessingOnEntry(t *testing.T) {
	queue, database := newTestQueue(t)

	// Pre-seed a row that crashed mid-processing. Use Enqueue then
	// UpdateStatus(pending->processing) so we go through the public
	// repository API rather than raw SQL.
	const stalePath = "/tmp/batch/crashed.wav"
	stale, err := queue.Enqueue(stalePath)
	if err != nil {
		t.Fatalf("Enqueue(stale): %v", err)
	}
	if err := queue.UpdateStatus(stale.ID, db.BatchQueueStatusProcessing, 0.5); err != nil {
		t.Fatalf("UpdateStatus(stale->processing): %v", err)
	}

	const freshPath = "/tmp/batch/fresh.wav"
	fresh, err := queue.Enqueue(freshPath)
	if err != nil {
		t.Fatalf("Enqueue(fresh): %v", err)
	}

	lib := &fakeLibrary{recordings: map[string]*db.Recording{
		stalePath: {ID: 100, FilePath: stalePath},
		freshPath: {ID: 101, FilePath: freshPath},
	}}
	_ = database

	runner := &fakeRunner{}
	svc := NewService(queue, runner, lib)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := svc.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}

	calls := runner.callOrder()
	if len(calls) != 2 {
		t.Fatalf("runner saw %d calls, want 2 (stale must be reconciled + processed)", len(calls))
	}
	if calls[0] != stalePath {
		t.Errorf("first call = %q, want %q (reconciled stale row should drain first by id)", calls[0], stalePath)
	}

	for _, id := range []int64{stale.ID, fresh.ID} {
		it, err := queue.GetByID(id)
		if err != nil {
			t.Fatalf("GetByID(%d): %v", id, err)
		}
		if it.Status != db.BatchQueueStatusCompleted {
			t.Errorf("item %d status = %q, want %q", id, it.Status, db.BatchQueueStatusCompleted)
		}
	}
}

// TestBatchTranscriptionService_EmptyQueueReturnsNilImmediately verifies
// that Run on an empty queue is a no-op: returns nil quickly, emits no
// progress events, and does not call the runner. (test-strategy §6.)
func TestBatchTranscriptionService_EmptyQueueReturnsNilImmediately(t *testing.T) {
	queue, _ := newTestQueue(t)
	runner := &fakeRunner{}
	lib := &fakeLibrary{recordings: map[string]*db.Recording{}}
	svc := NewService(queue, runner, lib)

	mu, events, cb := drainEvents()
	svc.SetProgressCallback(cb)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	start := time.Now()
	if err := svc.Run(ctx); err != nil {
		t.Fatalf("Run on empty queue: %v", err)
	}
	if time.Since(start) > 1*time.Second {
		t.Errorf("Run on empty queue took %v, want <1s (must not spin)", time.Since(start))
	}

	if got := runner.callOrder(); len(got) != 0 {
		t.Errorf("runner was called %d times on empty queue (calls=%v)", len(got), got)
	}
	mu.Lock()
	n := len(*events)
	mu.Unlock()
	if n != 0 {
		t.Errorf("empty queue produced %d progress events, want 0", n)
	}
}
