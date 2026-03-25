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
