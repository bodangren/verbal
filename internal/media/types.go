package media

type PipelineState int

const (
	StateStopped PipelineState = iota
	StatePlaying
	StatePaused
)

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
