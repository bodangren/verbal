package ui

import (
	"os"
	"testing"
	"time"

	"verbal/internal/waveform"
)

func TestWaveformWidget_Creation(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	widget := NewWaveformWidget()
	if widget == nil {
		t.Fatal("NewWaveformWidget returned nil")
	}

	// Verify the underlying DrawingArea was created
	if widget.DrawingArea == nil {
		t.Error("DrawingArea is nil")
	}

	// Verify default dimensions
	if widget.width <= 0 {
		t.Error("Expected positive default width")
	}
	if widget.height <= 0 {
		t.Error("Expected positive default height")
	}
}

func TestWaveformWidget_SetData(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	widget := NewWaveformWidget()

	// Create test waveform data
	data := &waveform.Data{
		FilePath:   "/test/video.mp4",
		Duration:   60 * time.Second,
		SampleRate: 100,
		Samples: []waveform.Sample{
			{Time: 0, Amplitude: 0.5},
			{Time: time.Second, Amplitude: 0.8},
			{Time: 2 * time.Second, Amplitude: 0.3},
		},
	}

	widget.SetData(data)

	if widget.data == nil {
		t.Error("SetData did not set data")
	}

	if widget.data.FilePath != data.FilePath {
		t.Errorf("Expected FilePath %s, got %s", data.FilePath, widget.data.FilePath)
	}
}

func TestWaveformWidget_SetPosition(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	widget := NewWaveformWidget()

	// Set duration first (needed for position calculation)
	data := &waveform.Data{
		Duration: 60 * time.Second,
		Samples:  make([]waveform.Sample, 100),
	}
	widget.SetData(data)

	// Test setting position
	widget.SetPosition(30 * time.Second)

	if widget.position != 30*time.Second {
		t.Errorf("Expected position 30s, got %v", widget.position)
	}
}

func TestWaveformWidget_SetPositionCallback(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	widget := NewWaveformWidget()

	var callbackCalled bool
	var receivedPosition time.Duration

	widget.SetPositionCallback(func(pos time.Duration) {
		callbackCalled = true
		receivedPosition = pos
	})

	// Simulate a position click at 50% of duration
	data := &waveform.Data{
		Duration: 60 * time.Second,
		Samples:  make([]waveform.Sample, 100),
	}
	widget.SetData(data)

	// Trigger click simulation
	widget.simulateClickAt(0.5)

	if !callbackCalled {
		t.Error("Position callback was not called")
	}

	expectedPosition := 30 * time.Second
	if receivedPosition != expectedPosition {
		t.Errorf("Expected position %v, got %v", expectedPosition, receivedPosition)
	}
}

func TestWaveformWidget_ClearData(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	widget := NewWaveformWidget()

	// Set some data
	data := &waveform.Data{
		Duration: 60 * time.Second,
		Samples:  make([]waveform.Sample, 100),
	}
	widget.SetData(data)

	// Clear it
	widget.ClearData()

	if widget.data != nil {
		t.Error("ClearData did not clear data")
	}
}

func TestWaveformWidget_SizeAllocation(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	widget := NewWaveformWidget()

	// Set size request
	widget.SetSizeRequest(400, 100)

	// Verify the drawing area was configured
	if widget.DrawingArea == nil {
		t.Error("DrawingArea should not be nil")
	}
}

func TestWaveformWidget_Segments(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	widget := NewWaveformWidget()

	// Create waveform data
	data := &waveform.Data{
		FilePath:   "/test/video.mp4",
		Duration:   60 * time.Second,
		SampleRate: 100,
		Samples:    make([]waveform.Sample, 600),
	}
	for i := 0; i < 600; i++ {
		data.Samples[i] = waveform.Sample{
			Time:      time.Duration(i) * 100 * time.Millisecond,
			Amplitude: 0.5,
		}
	}
	widget.SetData(data)

	// Add segment markers
	segments := []SegmentMarker{
		{Time: 10 * time.Second, Label: "Intro", IsActive: false},
		{Time: 30 * time.Second, Label: "Main", IsActive: true},
		{Time: 50 * time.Second, Label: "Outro", IsActive: false},
	}
	widget.SetSegments(segments)

	// Verify segments were set
	got := widget.GetSegments()
	if len(got) != len(segments) {
		t.Errorf("segment count = %d, want %d", len(got), len(segments))
	}

	// Verify first segment
	if got[0].Time != 10*time.Second {
		t.Errorf("first segment time = %v, want 10s", got[0].Time)
	}
	if !got[1].IsActive {
		t.Error("second segment should be active")
	}
}
