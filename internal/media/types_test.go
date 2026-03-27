package media

import "testing"

func TestPipelineStateString(t *testing.T) {
	tests := []struct {
		state    PipelineState
		expected string
	}{
		{StateStopped, "stopped"},
		{StatePlaying, "playing"},
		{StatePaused, "paused"},
		{PipelineState(99), "stopped"},
	}
	for _, tt := range tests {
		got := tt.state.String()
		if got != tt.expected {
			t.Errorf("PipelineState(%d).String() = %q, want %q", tt.state, got, tt.expected)
		}
	}
}
