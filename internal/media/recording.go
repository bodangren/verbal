package media

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

// RecordingPipeline manages a GStreamer pipeline for recording video/audio.
// It supports both hardware (webcam/mic) and test source recording.
type RecordingPipeline struct {
	pipeline   *gst.Pipeline
	state      PipelineState
	outputPath string
	mu         sync.RWMutex
}

// RecordingConfig contains configuration options for recording.
type RecordingConfig struct {
	UseHardware bool   // If true, use hardware devices; otherwise use test sources
	VideoDevice string // Path to video device (e.g., /dev/video0) when UseHardware is true
}

// NewRecordingPipeline creates a new recording pipeline using test sources.
// For hardware recording, use NewHardwareRecordingPipeline or NewRecordingPipelineWithFallback.
func NewRecordingPipeline(outputPath string) (*RecordingPipeline, error) {
	return NewRecordingPipelineWithConfig(outputPath, RecordingConfig{UseHardware: false})
}

// NewRecordingPipelineWithConfig creates a recording pipeline with the specified configuration.
// It supports both hardware devices and test sources based on the config.
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

// NewHardwareRecordingPipeline creates a recording pipeline using the default hardware devices.
// It automatically detects and uses the default video and audio devices.
// Returns an error if no video device is available.
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

// NewRecordingPipelineWithFallback attempts to create a hardware recording pipeline,
// but falls back to test sources if no video device is available.
// This is useful for development or when hardware availability is uncertain.
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

// Start begins recording by setting the GStreamer pipeline to PLAYING state.
// This method is thread-safe.
func (r *RecordingPipeline) Start() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pipeline.SetState(gst.StatePlaying)
	r.state = StatePlaying
}

// Stop ends recording by setting the GStreamer pipeline to NULL state.
// This method is thread-safe.
func (r *RecordingPipeline) Stop() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pipeline.SetState(gst.StateNull)
	r.state = StateStopped
}

// GetState returns the current state of the recording pipeline.
// This method is thread-safe.
func (r *RecordingPipeline) GetState() PipelineState {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.state
}

// OutputPath returns the file path where the recording will be saved.
// This method is thread-safe.
func (r *RecordingPipeline) OutputPath() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.outputPath
}
