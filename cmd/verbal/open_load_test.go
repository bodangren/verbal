package main

import (
	"os"
	"path/filepath"
	"testing"

	"verbal/internal/ui"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

func hasDisplayForMainTests() bool {
	return os.Getenv("DISPLAY") != "" || os.Getenv("WAYLAND_DISPLAY") != ""
}

func TestOpenRecordingPathSwitchesToPlaybackView(t *testing.T) {
	if !hasDisplayForMainTests() {
		t.Skip("No display available")
	}

	gtk.Init()

	tempDir := t.TempDir()
	videoPath := filepath.Join(tempDir, "sample video.mp4")
	if err := os.WriteFile(videoPath, []byte{}, 0o644); err != nil {
		t.Fatalf("create test video: %v", err)
	}

	stack := gtk.NewStack()
	library := gtk.NewBox(gtk.OrientationVertical, 0)
	playbackWindow := ui.NewPlaybackWindow()
	stack.AddNamed(library, "library")
	stack.AddNamed(playbackWindow.Widget(), "playback")
	stack.SetVisibleChildName("library")

	state := &appState{
		stack:          stack,
		playbackWindow: playbackWindow,
		loader:         ui.NewRecordingLoader(),
	}

	if !openRecordingPath(state, videoPath) {
		t.Fatal("openRecordingPath returned false for existing video path")
	}

	if state.currentPath != videoPath {
		t.Fatalf("currentPath = %q, want %q", state.currentPath, videoPath)
	}
	if stack.VisibleChildName() != "playback" {
		t.Fatalf("visible child = %q, want playback", stack.VisibleChildName())
	}
	if playbackWindow.GetEditableTranscription() == nil {
		t.Fatal("expected placeholder transcription view to be set")
	}
	if playbackWindow.GetVideoWidget() == nil {
		t.Fatal("expected video pane widget to be set")
	}
}

func TestConfigureMainWindowDefaults(t *testing.T) {
	if !hasDisplayForMainTests() {
		t.Skip("No display available")
	}

	gtk.Init()

	window := gtk.NewWindow()
	configureMainWindowDefaults(window)

	width, height := window.DefaultSize()
	if width != 1000 || height != 640 {
		t.Fatalf("default size = %dx%d, want 1000x640", width, height)
	}
	if !window.Resizable() {
		t.Fatal("main window should be resizable")
	}
}
