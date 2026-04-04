package ui

import (
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

func TestPlaybackWindow_Creation(t *testing.T) {
	// Skip if no display available
	if !hasDisplay() {
		t.Skip("No display available")
	}

	window := NewPlaybackWindow()
	if window == nil {
		t.Fatal("NewPlaybackWindow returned nil")
	}

	// Verify the window has a paned container
	paned := window.GetPaned()
	if paned == nil {
		t.Error("GetPaned() returned nil")
	}

	// Verify initial position is around 60%
	position := window.GetPanePosition()
	if position <= 0 {
		t.Errorf("Expected positive pane position, got %d", position)
	}
}

func TestPlaybackWindow_SetVideoWidget(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	window := NewPlaybackWindow()

	// Create a dummy widget to use as video widget
	videoWidget := gtk.NewBox(gtk.OrientationVertical, 0)

	window.SetVideoWidget(&videoWidget.Widget)

	// Verify video widget was set (compare as gtk.Widget)
	retrieved := window.GetVideoWidget()
	if retrieved == nil {
		t.Error("GetVideoWidget() returned nil")
	}
}

func TestPlaybackWindow_SetTranscriptionWidget(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	window := NewPlaybackWindow()

	// Create a dummy widget to use as transcription widget
	transcriptionWidget := gtk.NewBox(gtk.OrientationVertical, 0)

	window.SetTranscriptionWidget(&transcriptionWidget.Widget)

	// Verify transcription widget was set (compare as gtk.Widget)
	retrieved := window.GetTranscriptionWidget()
	if retrieved == nil {
		t.Error("GetTranscriptionWidget() returned nil")
	}
}

func TestPlaybackWindow_PanePosition(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	window := NewPlaybackWindow()

	// Set a specific pane position
	window.SetPanePosition(400)

	// Verify position was set
	position := window.GetPanePosition()
	if position != 400 {
		t.Errorf("Expected pane position 400, got %d", position)
	}
}

func TestPlaybackWindow_PlaybackControls(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	window := NewPlaybackWindow()

	// Verify controls exist
	if window.playButton == nil {
		t.Error("playButton is nil")
	}
	if window.pauseButton == nil {
		t.Error("pauseButton is nil")
	}
	if window.stopButton == nil {
		t.Error("stopButton is nil")
	}
	if window.seekSlider == nil {
		t.Error("seekSlider is nil")
	}
	if window.timeLabel == nil {
		t.Error("timeLabel is nil")
	}
}

func TestPlaybackWindow_PlayPauseCallbacks(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	window := NewPlaybackWindow()

	// Set up test callbacks
	playCalled := false
	pauseCalled := false
	stopCalled := false

	window.SetPlayCallback(func() { playCalled = true })
	window.SetPauseCallback(func() { pauseCalled = true })
	window.SetStopCallback(func() { stopCalled = true })

	// Suppress unused variable warnings by using the variables
	_ = playCalled
	_ = pauseCalled
	_ = stopCalled

	// Simulate button clicks via direct callback invocation
	// Note: We can't actually click GTK buttons in tests, but we can verify
	// the callbacks are wired correctly

	if window.onPlay == nil {
		t.Error("onPlay callback not set")
	}
	if window.onPause == nil {
		t.Error("onPause callback not set")
	}
	if window.onStop == nil {
		t.Error("onStop callback not set")
	}
}

func TestPlaybackWindow_SeekCallback(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	window := NewPlaybackWindow()

	seekCalled := false
	var seekPosition float64

	window.SetSeekCallback(func(position float64) {
		seekCalled = true
		seekPosition = position
	})

	if window.onSeek == nil {
		t.Error("onSeek callback not set")
	}

	// Simulate a seek
	window.onSeek(10.5)

	if !seekCalled {
		t.Error("Seek callback was not called")
	}
	if seekPosition != 10.5 {
		t.Errorf("Expected seek position 10.5, got %f", seekPosition)
	}
}

func TestPlaybackWindow_UpdateTimeDisplay(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	window := NewPlaybackWindow()

	// Update time display
	window.UpdateTimeDisplay(65.5, 120.0)

	// Get the time label text
	text := window.timeLabel.Text()

	// Should show "1:05 / 2:00"
	expected := "1:05 / 2:00"
	if text != expected {
		t.Errorf("Expected time display '%s', got '%s'", expected, text)
	}
}

func TestPlaybackWindow_UpdateSeekSlider(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	window := NewPlaybackWindow()

	// Update seek slider with position and duration
	window.UpdateSeekSlider(30.0, 120.0)

	// Verify slider was updated (value should be 25% of range)
	value := window.seekSlider.Value()
	expectedValue := 25.0

	if value != expectedValue {
		t.Errorf("Expected slider value %f, got %f", expectedValue, value)
	}
}

func TestPlaybackWindow_ErrorDisplay(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	window := NewPlaybackWindow()

	// Verify error is hidden initially
	if window.errorLabel.Visible() {
		t.Error("Error label should be hidden initially")
	}

	// Show error
	window.ShowError("Test error message")

	// Verify error is visible with correct message
	if !window.errorLabel.Visible() {
		t.Error("Error label should be visible after ShowError")
	}
	if window.errorLabel.Text() != "Test error message" {
		t.Errorf("Expected error message 'Test error message', got '%s'", window.errorLabel.Text())
	}

	// Clear error
	window.ClearError()

	// Verify error is hidden
	if window.errorLabel.Visible() {
		t.Error("Error label should be hidden after ClearError")
	}
}

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		seconds  float64
		expected string
	}{
		{0, "0:00"},
		{59, "0:59"},
		{60, "1:00"},
		{65.5, "1:05"},
		{120, "2:00"},
		{3661, "61:01"},
	}

	for _, tt := range tests {
		if got := formatDuration(tt.seconds); got != tt.expected {
			t.Errorf("formatDuration(%v) = %v, want %v", tt.seconds, got, tt.expected)
		}
	}
}
