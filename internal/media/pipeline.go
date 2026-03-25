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
	pipeline    *gst.Pipeline
	state       PipelineState
	useHardware bool
	videoDevice string
	mu          sync.RWMutex
}

type PreviewConfig struct {
	UseHardware bool
	VideoDevice string
}

func NewPreviewPipeline() (*Pipeline, error) {
	return NewPreviewPipelineWithConfig(PreviewConfig{UseHardware: false})
}

func NewPreviewPipelineWithConfig(config PreviewConfig) (*Pipeline, error) {
	var pipelineStr string
	if config.UseHardware {
		videoDevice := config.VideoDevice
		if videoDevice == "" {
			videoDevice = "/dev/video0"
		}
		pipelineStr = fmt.Sprintf("v4l2src device=%s ! video/x-raw,width=640,height=480,framerate=30/1 ! videoconvert ! autovideosink", videoDevice)
	} else {
		pipelineStr = "videotestsrc ! autovideosink"
	}

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return nil, fmt.Errorf("element is not a pipeline")
	}

	return &Pipeline{
		pipeline:    pipeline,
		state:       StateStopped,
		useHardware: config.UseHardware,
		videoDevice: config.VideoDevice,
	}, nil
}

func NewHardwarePreviewPipeline() (*Pipeline, error) {
	videoDevice, err := GetDefaultVideoDevice()
	if err != nil {
		return nil, fmt.Errorf("no video device available: %w", err)
	}

	return NewPreviewPipelineWithConfig(PreviewConfig{
		UseHardware: true,
		VideoDevice: videoDevice.Path,
	})
}

func NewPreviewPipelineWithFallback() (*Pipeline, error) {
	if HasVideoDevice() {
		return NewHardwarePreviewPipeline()
	}
	return NewPreviewPipeline()
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

func (p *Pipeline) UsesHardware() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.useHardware
}

func init() {
	gst.Init()
}
