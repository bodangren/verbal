package media

// PipelineState represents the current state of a media pipeline.
type PipelineState int

const (
	StateStopped PipelineState = iota // Pipeline is stopped
	StatePlaying                      // Pipeline is actively processing/playing
	StatePaused                       // Pipeline is paused
)

// String returns a human-readable representation of the pipeline state.
func (s PipelineState) String() string {
	switch s {
	case StatePlaying:
		return "playing"
	case StatePaused:
		return "paused"
	default:
		return "stopped"
	}
}
