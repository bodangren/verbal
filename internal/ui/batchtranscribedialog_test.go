package ui

import (
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// Red-phase contract tests for the Batch Transcription Queue (Phase 3:
// UI Integration). See
// measure/tracks/batch_transcription_queue_20260509/test-strategy.md §6
// Phase 3 ("dialog wiring, action callbacks (skip on no-display)") and §9
// (targeted Red command: `go test ./internal/ui/ -run
// 'TestBatchTranscribeAction' -count=1`).
//
// The Green-phase implementation must add, in `internal/ui`, at minimum:
//
//   - const BatchTranscribeActionName = "batch-transcribe"
//   - type BatchTranscribeDialog struct { ... } with unexported fields
//     onEnqueue func([]string), onCancel func(), paths []string
//   - func NewBatchTranscribeDialog(parent *gtk.Window) *BatchTranscribeDialog
//   - method (*BatchTranscribeDialog) SetPaths(paths []string)
//   - method (*BatchTranscribeDialog) GetPaths() ([]string, error)
//   - method (*BatchTranscribeDialog) AddPath(path string) error
//   - method (*BatchTranscribeDialog) SetOnEnqueue(cb func(paths []string))
//   - method (*BatchTranscribeDialog) SetOnCancel(cb func())
//
// Constraints (test-strategy §2 + cross-phase §4):
//   - AddPath must reject any path containing "\n" or "\r" so malicious
//     paths cannot reach GStreamer pipeline descriptions.
//   - GetPaths must surface the validation error if any path was rejected.
//   - The dialog follows the existing ImportDialog pattern (modal
//     gtk.Dialog, gtk.NewFileChooserNative, embedded validation).
//
// The Green-phase author must (a) implement the surface above; (b) wire
// the dialog into internal/app/run.go alongside the existing
// transcribeAction (run.go:371) using the exact action name
// BatchTranscribeActionName; (c) ensure any progress callback paths from
// the worker goroutine route through glib.IdleAdd (lessons-learned
// §Thread Safety); (d) re-run the targeted Red command (must turn green
// or stay skipped on no display) then go test ./internal/ui/... -count=1
// for the broader gate.
//
// All tests below reference symbols that do not exist yet, so the
// package will fail to compile when the targeted Red command runs. That
// is the expected Red outcome. The Green-phase author must make these
// tests pass without removing or weakening any of the contracts above.

// TestBatchTranscribeAction is the artifact/contract test for the action
// name used by the batch transcribe menu item (test-strategy §7
// "Artifact/contract"). It is deliberately display-independent so it
// produces a clean Red signal in headless CI when the constant is
// missing — every other Phase 3 test is gated behind hasDisplay() and
// would otherwise skip silently.
func TestBatchTranscribeAction(t *testing.T) {
	if BatchTranscribeActionName != "batch-transcribe" {
		t.Fatalf("BatchTranscribeActionName = %q, want %q",
			BatchTranscribeActionName, "batch-transcribe")
	}
}

// TestBatchTranscribeDialog_Construction verifies the dialog can be
// instantiated and exposes an empty path list by default. (test-strategy
// §6 Phase 3 "dialog wiring".)
func TestBatchTranscribeDialog_Construction(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	d := NewBatchTranscribeDialog(nil)
	if d == nil {
		t.Fatal("NewBatchTranscribeDialog(nil) returned nil")
	}

	paths, err := d.GetPaths()
	if err != nil {
		t.Fatalf("GetPaths on fresh dialog: %v", err)
	}
	if len(paths) != 0 {
		t.Errorf("default GetPaths length = %d, want 0", len(paths))
	}
}

// TestBatchTranscribeDialog_SetPaths verifies SetPaths/GetPaths
// round-trip. (test-strategy §6 Phase 3.)
func TestBatchTranscribeDialog_SetPaths(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	d := NewBatchTranscribeDialog(nil)

	want := []string{"/tmp/batch/a.wav", "/tmp/batch/b.wav", "/tmp/batch/c.wav"}
	d.SetPaths(want)

	got, err := d.GetPaths()
	if err != nil {
		t.Fatalf("GetPaths after SetPaths: %v", err)
	}
	if len(got) != len(want) {
		t.Fatalf("GetPaths length = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("GetPaths[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

// TestBatchTranscribeDialog_RejectsNewlinePaths verifies that AddPath
// rejects any path containing an embedded newline character so that
// malicious paths cannot reach the GStreamer pipeline description.
// (test-strategy §2 GStreamer path safety + cross-phase §4.)
func TestBatchTranscribeDialog_RejectsNewlinePaths(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	d := NewBatchTranscribeDialog(nil)

	// Seed one clean path.
	if err := d.AddPath("/tmp/batch/clean.wav"); err != nil {
		t.Fatalf("AddPath(clean): %v", err)
	}

	// Path with an embedded newline must be rejected.
	if err := d.AddPath("/tmp/batch/evil\n.wav"); err == nil {
		t.Error("AddPath with embedded \\n must return an error")
	}

	// Path with an embedded carriage return must also be rejected.
	if err := d.AddPath("/tmp/batch/evil\r.wav"); err == nil {
		t.Error("AddPath with embedded \\r must return an error")
	}

	paths, _ := d.GetPaths()
	if len(paths) != 1 {
		t.Errorf("rejected paths must not be added; got %v", paths)
	}
}

// TestBatchTranscribeDialog_CallbackWiring verifies SetOnEnqueue and
// SetOnCancel register their callbacks. (test-strategy §6 Phase 3
// "action callbacks" — artifact/contract.)
func TestBatchTranscribeDialog_CallbackWiring(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	d := NewBatchTranscribeDialog(nil)

	if d.onEnqueue != nil {
		t.Error("onEnqueue should be nil before SetOnEnqueue")
	}
	if d.onCancel != nil {
		t.Error("onCancel should be nil before SetOnCancel")
	}

	enqueueCalled := false
	cancelCalled := false
	var receivedPaths []string

	d.SetOnEnqueue(func(paths []string) {
		enqueueCalled = true
		receivedPaths = paths
	})
	d.SetOnCancel(func() { cancelCalled = true })

	if d.onEnqueue == nil {
		t.Error("onEnqueue not set after SetOnEnqueue")
	}
	if d.onCancel == nil {
		t.Error("onCancel not set after SetOnCancel")
	}

	// Trigger the callbacks directly to prove they were registered as
	// Go funcs (no GTK signal involved). The slice literal mirrors the
	// contract: the callback receives the validated path list.
	d.onEnqueue([]string{"/tmp/batch/probe.wav"})
	d.onCancel()

	if !enqueueCalled {
		t.Error("onEnqueue callback did not fire")
	}
	if !cancelCalled {
		t.Error("onCancel callback did not fire")
	}
	if len(receivedPaths) != 1 || receivedPaths[0] != "/tmp/batch/probe.wav" {
		t.Errorf("onEnqueue received %v, want [/tmp/batch/probe.wav]", receivedPaths)
	}
}