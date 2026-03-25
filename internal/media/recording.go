package media

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

type RecordingPipeline struct {
	pipeline   *gst.Pipeline
	state      PipelineState
	outputPath string
	mu         sync.RWMutex
}

func NewRecordingPipeline(outputPath string) (*RecordingPipeline, error) {
	if outputPath == "" {
		return nil, fmt.Errorf("output path cannot be empty")
	}

	dir := filepath.Dir(outputPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create output directory: %w", err)
	}

	pipelineStr := fmt.Sprintf(
		"videotestsrc ! video/x-raw,width=640,height=30,framerate=30/1 ! "+
			"videoconvert ! vp8enc ! webmmux name=mux ! "+
			"filesink location=%s "+
			"audiotestsrc ! audioconvert ! audioresample ! opusenc ! mux.",
		outputPath,
	)

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse recording pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return nil, fmt.Errorf("element is not a pipeline")
	}

	return &RecordingPipeline{
		pipeline:   pipeline,
		state:      StateStopped,
		outputPath: outputPath,
	}, nil
}

func (r *RecordingPipeline) Start() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pipeline.SetState(gst.StatePlaying)
	r.state = StatePlaying
}

func (r *RecordingPipeline) Stop() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pipeline.SetState(gst.StateNull)
	r.state = StateStopped
}

func (r *RecordingPipeline) Pause() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pipeline.SetState(gst.StatePaused)
	r.state = StatePaused
}

func (r *RecordingPipeline) GetState() PipelineState {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.state
}

func (r *RecordingPipeline) OutputPath() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.outputPath
}
