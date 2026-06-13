package media

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Tests for the new internal/media.Exporter (spec FR3, test-strategy §5
// P3). The Exporter copies the original media file to a user-selected
// destination with a buffered io.Copy, reporting progress via a
// callback and honoring context cancellation. It MUST NOT touch
// GStreamer (test-strategy §4) and is a separate type from the existing
// SegmentExporter (different scope: whole-file vs. segment-cut export).
//
// Production code lives in internal/media/exporter.go. Tests are
// guarded with t.Skip during the Red phase per test-strategy §8; the
// STUB block at the bottom of this file declares the expected API so
// the file compiles.

func TestExporter_HappyPath_CopiesFile(t *testing.T) {
	tmpDir := t.TempDir()
	srcPath := filepath.Join(tmpDir, "src.mp4")
	destPath := filepath.Join(tmpDir, "dest.mp4")

	payload := make([]byte, 1024)
	if _, err := rand.Read(payload); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}
	if err := os.WriteFile(srcPath, payload, 0o644); err != nil {
		t.Fatalf("WriteFile src: %v", err)
	}

	exp := NewExporter()
	if err := exp.Export(context.Background(), srcPath, destPath, nil); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}

	got, err := os.ReadFile(destPath)
	if err != nil {
		t.Fatalf("ReadFile dest: %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Errorf("dest contents do not match src: len=%d want=%d", len(got), len(payload))
	}
}

func TestExporter_SourceMissing_ReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	srcPath := filepath.Join(tmpDir, "does_not_exist.mp4")
	destPath := filepath.Join(tmpDir, "dest.mp4")

	exp := NewExporter()
	err := exp.Export(context.Background(), srcPath, destPath, nil)
	if err == nil {
		t.Fatal("Export returned nil error for missing source, want error")
	}

	if _, statErr := os.Stat(destPath); !os.IsNotExist(statErr) {
		t.Errorf("dest file should not exist after failed Export; stat error = %v", statErr)
	}
}

func TestExporter_DestUnwritable_ReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	srcPath := filepath.Join(tmpDir, "src.mp4")
	if err := os.WriteFile(srcPath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("WriteFile src: %v", err)
	}

	// Parent directory does not exist -> os.Create will fail.
	destPath := filepath.Join(tmpDir, "nonexistent_subdir", "dest.mp4")

	exp := NewExporter()
	err := exp.Export(context.Background(), srcPath, destPath, nil)
	if err == nil {
		t.Fatal("Export returned nil error for unwritable dest, want error")
	}

	if _, statErr := os.Stat(destPath); !os.IsNotExist(statErr) {
		t.Errorf("dest file should not exist after failed Export; stat error = %v", statErr)
	}
}

func TestExporter_ProgressMonotonic(t *testing.T) {
	tmpDir := t.TempDir()
	srcPath := filepath.Join(tmpDir, "src.mp4")
	destPath := filepath.Join(tmpDir, "dest.mp4")

	payload := bytes.Repeat([]byte{0xAB}, 4096)
	if err := os.WriteFile(srcPath, payload, 0o644); err != nil {
		t.Fatalf("WriteFile src: %v", err)
	}

	type progressEvent struct {
		percent float64
		msg     string
	}
	var events []progressEvent

	exp := NewExporter()
	err := exp.Export(context.Background(), srcPath, destPath,
		func(percent float64, msg string) {
			events = append(events, progressEvent{percent: percent, msg: msg})
		})
	if err != nil {
		t.Fatalf("Export returned error: %v", err)
	}

	if len(events) == 0 {
		t.Fatal("progress callback was never invoked; want at least start + end")
	}

	if events[0].percent != 0.0 {
		t.Errorf("first progress event percent = %v, want 0.0", events[0].percent)
	}
	if events[len(events)-1].percent != 1.0 {
		t.Errorf("last progress event percent = %v, want 1.0", events[len(events)-1].percent)
	}

	for i := 1; i < len(events); i++ {
		if events[i].percent < events[i-1].percent {
			t.Errorf("progress not monotonic at index %d: prev=%v cur=%v",
				i, events[i-1].percent, events[i].percent)
		}
		if events[i].percent < 0.0 || events[i].percent > 1.0 {
			t.Errorf("progress out of range at index %d: %v", i, events[i].percent)
		}
	}
}

func TestExporter_ContextCanceledMidCopy_ReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	srcPath := filepath.Join(tmpDir, "src.bin")
	destPath := filepath.Join(tmpDir, "dest.bin")

	payload := make([]byte, 5*1024*1024)
	if _, err := rand.Read(payload); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}
	if err := os.WriteFile(srcPath, payload, 0o644); err != nil {
		t.Fatalf("WriteFile src: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	exp := NewExporter()
	err := exp.Export(ctx, srcPath, destPath,
		func(percent float64, msg string) {
			if percent > 0.0 && percent < 0.5 {
				cancel()
			}
		})
	if err == nil {
		t.Fatal("Export returned nil error after context cancel, want error")
	}
	if !errors.Is(err, context.Canceled) && !strings.Contains(err.Error(), "context canceled") {
		t.Errorf("Export error does not wrap context.Canceled: %v", err)
	}

	done := make(chan struct{})
	go func() {
		for {
			if _, statErr := os.Stat(destPath); statErr == nil {
				close(done)
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		// dest may not exist at all if cancel fired before file creation;
		// that's acceptable.
	}
}

