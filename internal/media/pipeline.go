package media

import (
	"fmt"
	"sync"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

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

type Pipeline struct {
	pipeline *gst.Pipeline
	state    PipelineState
	mu       sync.RWMutex
}

func NewPreviewPipeline() (*Pipeline, error) {
	element, err := gst.ParseLaunch("videotestsrc ! autovideosink")
	if err != nil {
		return nil, fmt.Errorf("failed to parse pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return nil, fmt.Errorf("element is not a pipeline")
	}

	return &Pipeline{
		pipeline: pipeline,
		state:    StateStopped,
	}, nil
}

func (p *Pipeline) Start() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.pipeline.SetState(gst.StatePlaying)
	p.state = StatePlaying
}

func (p *Pipeline) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.pipeline.SetState(gst.StateNull)
	p.state = StateStopped
}

func (p *Pipeline) Pause() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.pipeline.SetState(gst.StatePaused)
	p.state = StatePaused
}

func (p *Pipeline) GetState() PipelineState {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.state
}

func init() {
	gst.Init()
}
