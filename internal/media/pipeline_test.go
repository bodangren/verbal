package media

import (
	"testing"
)

func TestPipelineStateString(t *testing.T) {
	tests := []struct {
		state    PipelineState
		expected string
	}{
		{StateStopped, "stopped"},
		{StatePlaying, "playing"},
		{StatePaused, "paused"},
	}

	for _, tt := range tests {
		if got := tt.state.String(); got != tt.expected {
			t.Errorf("PipelineState(%d).String() = %q, want %q", tt.state, got, tt.expected)
		}
	}
}

func TestNewPreviewPipelineCreatesPipeline(t *testing.T) {
	pipeline, err := NewPreviewPipeline()
	if err != nil {
		t.Fatalf("NewPreviewPipeline() error = %v", err)
	}
	if pipeline == nil {
		t.Fatal("NewPreviewPipeline() returned nil pipeline")
	}
}

func TestPipelineInitialState(t *testing.T) {
	pipeline, err := NewPreviewPipeline()
	if err != nil {
		t.Fatalf("NewPreviewPipeline() error = %v", err)
	}

	state := pipeline.GetState()
	if state != StateStopped {
		t.Errorf("Initial state = %v, want %v", state, StateStopped)
	}
}

func TestPipelineStartChangesState(t *testing.T) {
	pipeline, err := NewPreviewPipeline()
	if err != nil {
		t.Fatalf("NewPreviewPipeline() error = %v", err)
	}

	pipeline.Start()
	state := pipeline.GetState()
	if state != StatePlaying {
		t.Errorf("After Start() state = %v, want %v", state, StatePlaying)
	}

	pipeline.Stop()
}

func TestPipelineStopChangesState(t *testing.T) {
	pipeline, err := NewPreviewPipeline()
	if err != nil {
		t.Fatalf("NewPreviewPipeline() error = %v", err)
	}

	pipeline.Start()
	pipeline.Stop()
	state := pipeline.GetState()
	if state != StateStopped {
		t.Errorf("After Stop() state = %v, want %v", state, StateStopped)
	}
}

func TestNewPreviewPipelineWithConfig(t *testing.T) {
	config := PreviewConfig{UseHardware: false}
	pipeline, err := NewPreviewPipelineWithConfig(config)
	if err != nil {
		t.Fatalf("NewPreviewPipelineWithConfig() error = %v", err)
	}
	if pipeline == nil {
		t.Fatal("NewPreviewPipelineWithConfig() returned nil pipeline")
	}
	if pipeline.UsesHardware() {
		t.Error("Expected UsesHardware() to be false for test source")
	}
	pipeline.Stop()
}

func TestNewHardwarePreviewPipelineNoDevice(t *testing.T) {
	if HasVideoDevice() {
		t.Skip("skipping - video devices exist on this system")
	}

	_, err := NewHardwarePreviewPipeline()
	if err == nil {
		t.Error("NewHardwarePreviewPipeline expected error when no devices")
	}
}

func TestNewPreviewPipelineWithFallback(t *testing.T) {
	pipeline, err := NewPreviewPipelineWithFallback()
	if err != nil {
		t.Fatalf("NewPreviewPipelineWithFallback() error = %v", err)
	}
	if pipeline == nil {
		t.Fatal("NewPreviewPipelineWithFallback() returned nil pipeline")
	}
	pipeline.Stop()
}

func TestPipelineUsesHardware(t *testing.T) {
	config := PreviewConfig{UseHardware: false}
	pipeline, err := NewPreviewPipelineWithConfig(config)
	if err != nil {
		t.Fatalf("NewPreviewPipelineWithConfig() error = %v", err)
	}
	if pipeline.UsesHardware() {
		t.Error("Expected UsesHardware() to be false")
	}
	pipeline.Stop()
}

func TestHasGtk4PaintableSink(t *testing.T) {
	hasPlugin := HasGtk4PaintableSink()
	t.Logf("HasGtk4PaintableSink() = %v", hasPlugin)
}

func TestNewEmbeddedPreviewPipelineWithoutPlugin(t *testing.T) {
	if HasGtk4PaintableSink() {
		t.Skip("skipping - gtk4paintablesink is available")
	}

	_, err := NewEmbeddedPreviewPipeline(PreviewConfig{UseHardware: false})
	if err == nil {
		t.Error("NewEmbeddedPreviewPipeline expected error when plugin not available")
	}
}

func TestNewEmbeddedPreviewPipelineWithFallback(t *testing.T) {
	_, err := NewEmbeddedPreviewPipelineWithFallback(PreviewConfig{UseHardware: false})
	if HasGtk4PaintableSink() {
		if err != nil {
			t.Fatalf("NewEmbeddedPreviewPipelineWithFallback() error = %v", err)
		}
	} else {
		if err == nil {
			t.Error("Expected error when gtk4paintablesink not available")
		}
	}
}
