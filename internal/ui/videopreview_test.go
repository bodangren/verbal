package ui

import (
	"os"
	"testing"
)

func TestNewVideoPreview(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("skipping - no display available")
	}

	vp := NewVideoPreview()
	if vp == nil {
		t.Fatal("NewVideoPreview() returned nil")
	}
	if vp.Widget() == nil {
		t.Error("VideoPreview.Widget() returned nil")
	}
}

func TestVideoPreviewInitialState(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("skipping - no display available")
	}

	vp := NewVideoPreview()
	if vp.GetState() != 0 {
		t.Errorf("Initial state = %v, want 0 (StateStopped)", vp.GetState())
	}
	if vp.UsesHardware() {
		t.Error("Initial UsesHardware() should be false")
	}
}

func TestVideoPreviewSetNilPipeline(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("skipping - no display available")
	}

	vp := NewVideoPreview()
	vp.SetPipeline(nil)
	if vp.GetState() != 0 {
		t.Errorf("State after nil pipeline = %v, want 0", vp.GetState())
	}
}

func TestVideoPreviewStartWithoutPipeline(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("skipping - no display available")
	}

	vp := NewVideoPreview()
	vp.Start()
	if vp.GetState() != 0 {
		t.Errorf("State after start without pipeline = %v, want 0", vp.GetState())
	}
}

func TestVideoPreviewStopWithoutPipeline(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("skipping - no display available")
	}

	vp := NewVideoPreview()
	vp.Stop()
	if vp.GetState() != 0 {
		t.Errorf("State after stop without pipeline = %v, want 0", vp.GetState())
	}
}
