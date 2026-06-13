package ui

import (
	"context"
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// Red-phase contract tests for the Batch Transcription Queue sidebar
// panel (Phase 3: UI Integration). See
// measure/tracks/batch_transcription_queue_20260509/test-strategy.md §6
// Phase 3 ("stub queue model drives the sidebar") and §9 (targeted Red
// command: `go test ./internal/ui/ -run 'TestBatchTranscribeAction'
// -count=1`).
//
// The Green-phase implementation must add, in `internal/ui`, at minimum:
//
//   - type BatchQueueItemView struct {
//         ID        int64
//         FilePath  string
//         Status    string
//         Progress  float64
//     }
//   - type BatchQueueModel interface {
//         ListItems(ctx context.Context) ([]BatchQueueItemView, error)
//     }
//   - type BatchQueuePanel struct { ... } with unexported fields
//     model BatchQueueModel, items []BatchQueueItemView,
//     onCancelItem func(int64), onPauseToggle func(bool), paused bool
//   - func NewBatchQueuePanel(model BatchQueueModel) *BatchQueuePanel
//   - method (*BatchQueuePanel) Widget() *gtk.Widget
//   - method (*BatchQueuePanel) Refresh(ctx context.Context) error
//   - method (*BatchQueuePanel) Snapshot() []BatchQueueItemView
//   - method (*BatchQueuePanel) SetOnCancelItem(cb func(id int64))
//   - method (*BatchQueuePanel) SetOnPauseToggle(cb func(paused bool))
//   - method (*BatchQueuePanel) SetPaused(paused bool)
//   - method (*BatchQueuePanel) CancelItem(id int64)
//
// The panel must not poll the model directly; the caller (production:
// the application controller, called from glib.IdleAdd from the batch
// worker goroutine) drives Refresh after every ProgressEvent
// (test-strategy cross-phase §4 "Progress callbacks"). The panel surface
// must stay decoupled from internal/db so the test can drive it with a
// stub model without touching SQLite (test-strategy §6 Phase 3 + §7
// "Fakes are never registered as production gates").
//
// The Green-phase author must (a) implement the surface above; (b) wire
// a production BatchQueueModel adapter in internal/app/run.go that
// converts *db.BatchQueueItem into BatchQueueItemView (and reads from
// the existing db.Database.BatchQueueRepo() handle); (c) ensure Refresh
// is only invoked on the GTK main thread (lessons-learned §Thread
// Safety); (d) re-run the targeted Red command (must turn green or stay
// skipped on no display) then go test ./internal/ui/... -count=1 for
// the broader gate.
//
// All tests below reference symbols that do not exist yet, so the
// package will fail to compile when the targeted Red command runs. That
// is the expected Red outcome. The Green-phase author must make these
// tests pass without removing or weakening any of the contracts above.

// stubBatchQueueModel is a test-only in-memory implementation of
// BatchQueueModel. It exists exclusively in this _test.go file; go vet
// + go build ./... will fail if it leaks into a non-test file
// (test-strategy §7).
type stubBatchQueueModel struct {
	items []BatchQueueItemView
	err   error
	// calls records the number of ListItems invocations so tests can
	// verify Refresh actually delegates to the model.
	calls int
}

func (s *stubBatchQueueModel) ListItems(ctx context.Context) ([]BatchQueueItemView, error) {
	s.calls++
	return s.items, s.err
}

// TestBatchQueuePanel_Construction verifies the panel can be
// instantiated and exposes a non-nil GTK widget for embedding.
// (test-strategy §6 Phase 3.)
func TestBatchQueuePanel_Construction(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	m := &stubBatchQueueModel{}
	p := NewBatchQueuePanel(m)
	if p == nil {
		t.Fatal("NewBatchQueuePanel returned nil")
	}
	if p.Widget() == nil {
		t.Error("Widget() returned nil — panel must embed a GTK widget")
	}
	if p.Snapshot() == nil {
		t.Error("Snapshot() returned nil — must return a non-nil (possibly empty) slice")
	}
	if len(p.Snapshot()) != 0 {
		t.Errorf("initial Snapshot length = %d, want 0", len(p.Snapshot()))
	}
}

// TestBatchQueuePanel_DrivenByStubModel verifies that a stub queue
// model (no SQLite required) drives the sidebar widget via Refresh,
// and that the resulting Snapshot reflects the stub's items. This is
// the live-behavior part of Phase 3 (test-strategy §6 "stub queue model
// drives the sidebar" + §7).
func TestBatchQueuePanel_DrivenByStubModel(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	wantItems := []BatchQueueItemView{
		{ID: 1, FilePath: "/tmp/batch/a.wav", Status: "pending", Progress: 0},
		{ID: 2, FilePath: "/tmp/batch/b.wav", Status: "processing", Progress: 0.5},
		{ID: 3, FilePath: "/tmp/batch/c.wav", Status: "completed", Progress: 1.0},
	}
	m := &stubBatchQueueModel{items: wantItems}
	p := NewBatchQueuePanel(m)

	if err := p.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if m.calls != 1 {
		t.Errorf("Refresh did not call model.ListItems exactly once (calls=%d)", m.calls)
	}

	got := p.Snapshot()
	if len(got) != len(wantItems) {
		t.Fatalf("Snapshot length = %d, want %d", len(got), len(wantItems))
	}
	for i := range wantItems {
		if got[i].ID != wantItems[i].ID {
			t.Errorf("Snapshot[%d].ID = %d, want %d", i, got[i].ID, wantItems[i].ID)
		}
		if got[i].FilePath != wantItems[i].FilePath {
			t.Errorf("Snapshot[%d].FilePath = %q, want %q", i, got[i].FilePath, wantItems[i].FilePath)
		}
		if got[i].Status != wantItems[i].Status {
			t.Errorf("Snapshot[%d].Status = %q, want %q", i, got[i].Status, wantItems[i].Status)
		}
		if got[i].Progress != wantItems[i].Progress {
			t.Errorf("Snapshot[%d].Progress = %v, want %v", i, got[i].Progress, wantItems[i].Progress)
		}
	}

	// Refresh again with a different snapshot — panel must re-fetch.
	m.items = m.items[:1]
	if err := p.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh (2nd): %v", err)
	}
	if m.calls != 2 {
		t.Errorf("second Refresh did not re-fetch (calls=%d)", m.calls)
	}
	if got := len(p.Snapshot()); got != 1 {
		t.Errorf("Snapshot length after 2nd Refresh = %d, want 1", got)
	}
}

// TestBatchQueuePanel_CancelCallbackFiresWithID verifies that the
// per-row cancel control fires the registered callback with the item ID
// the caller passed to CancelItem. (test-strategy §6 Phase 3 "cancel/
// pause controls" + cross-phase §4 "Cancel races".)
func TestBatchQueuePanel_CancelCallbackFiresWithID(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	m := &stubBatchQueueModel{items: []BatchQueueItemView{
		{ID: 7, FilePath: "/tmp/batch/x.wav", Status: "processing", Progress: 0.5},
	}}
	p := NewBatchQueuePanel(m)
	if err := p.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	var gotID int64
	var fired bool
	p.SetOnCancelItem(func(id int64) {
		gotID = id
		fired = true
	})

	if p.onCancelItem == nil {
		t.Fatal("onCancelItem not set after SetOnCancelItem")
	}

	p.CancelItem(7)

	if !fired {
		t.Error("cancel callback did not fire")
	}
	if gotID != 7 {
		t.Errorf("cancel callback received id=%d, want 7", gotID)
	}
}

// TestBatchQueuePanel_PauseToggleCallback verifies that SetPaused(true)
// fires the registered pause-toggle callback with true, and that the
// panel's internal paused state reflects the toggle. (test-strategy §6
// Phase 3 "cancel/pause controls".)
func TestBatchQueuePanel_PauseToggleCallback(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	m := &stubBatchQueueModel{}
	p := NewBatchQueuePanel(m)

	var gotPaused bool
	var fired bool
	p.SetOnPauseToggle(func(paused bool) {
		gotPaused = paused
		fired = true
	})

	if p.onPauseToggle == nil {
		t.Fatal("onPauseToggle not set after SetOnPauseToggle")
	}

	p.SetPaused(true)
	if !fired {
		t.Error("pause toggle callback did not fire on SetPaused(true)")
	}
	if !gotPaused {
		t.Errorf("pause toggle callback received paused=false, want true")
	}
	if !p.paused {
		t.Error("panel.paused not true after SetPaused(true)")
	}

	// Toggle back to running and verify the callback receives the new
	// value, not a stale one.
	fired = false
	p.SetPaused(false)
	if !fired {
		t.Error("pause toggle callback did not fire on SetPaused(false)")
	}
	if gotPaused {
		t.Errorf("pause toggle callback received paused=true, want false")
	}
	if p.paused {
		t.Error("panel.paused not false after SetPaused(false)")
	}
}