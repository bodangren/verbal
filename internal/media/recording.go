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

type RecordingConfig struct {
	UseHardware bool
	VideoDevice string
}

func NewRecordingPipeline(outputPath string) (*RecordingPipeline, error) {
	return NewRecordingPipelineWithConfig(outputPath, RecordingConfig{UseHardware: false})
}

func NewRecordingPipelineWithConfig(outputPath string, config RecordingConfig) (*RecordingPipeline, error) {
	if outputPath == "" {
		return nil, fmt.Errorf("output path cannot be empty")
	}

	dir := filepath.Dir(outputPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create output directory: %w", err)
	}

	var pipelineStr string
	if config.UseHardware {
		pipelineStr = buildHardwareRecordingPipeline(outputPath, config)
	} else {
		pipelineStr = buildTestRecordingPipeline(outputPath)
	}

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

func NewHardwareRecordingPipeline(outputPath string) (*RecordingPipeline, error) {
	videoDevice, err := GetDefaultVideoDevice()
	if err != nil {
		return nil, fmt.Errorf("no video device available: %w", err)
	}

	return NewRecordingPipelineWithConfig(outputPath, RecordingConfig{
		UseHardware: true,
		VideoDevice: videoDevice.Path,
	})
}

func NewRecordingPipelineWithFallback(outputPath string) (*RecordingPipeline, error) {
	if HasVideoDevice() {
		return NewHardwareRecordingPipeline(outputPath)
	}
	return NewRecordingPipeline(outputPath)
}

func buildTestRecordingPipeline(outputPath string) string {
	return fmt.Sprintf(
		"videotestsrc ! video/x-raw,width=640,height=480,framerate=30/1 ! "+
			"videoconvert ! vp8enc ! webmmux name=mux ! "+
			"filesink location=%s "+
			"audiotestsrc ! audioconvert ! audioresample ! opusenc ! mux.",
		outputPath,
	)
}

func buildHardwareRecordingPipeline(outputPath string, config RecordingConfig) string {
	// Using autoaudiosrc to find the default mic reliably
	// Using x264enc + mp4mux for better compatibility
	return fmt.Sprintf(
		"v4l2src device=%s ! video/x-raw,width=640,height=480,framerate=30/1 ! "+
			"videoconvert ! x264enc tune=zerolatency ! mp4mux name=mux ! "+
			"filesink location=%s "+
			"autoaudiosrc ! audioconvert ! audioresample ! voaacenc ! mux.",
		config.VideoDevice,
		outputPath,
	)
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
