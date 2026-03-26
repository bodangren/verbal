package media

import (
	"fmt"
	"sync"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
	"github.com/diamondburned/gotk4/pkg/core/glib"
	"github.com/diamondburned/gotk4/pkg/gdk/v4"
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

type EmbeddedPipeline struct {
	pipeline    *gst.Pipeline
	state       PipelineState
	useHardware bool
	videoDevice string
	paintable   gdk.Paintabler
	mu          sync.RWMutex
}

func HasGtk4PaintableSink() bool {
	factory := gst.ElementFactoryFind("gtk4paintablesink")
	return factory != nil
}

func NewEmbeddedPreviewPipeline(config PreviewConfig) (*EmbeddedPipeline, error) {
	if !HasGtk4PaintableSink() {
		return nil, fmt.Errorf("gtk4paintablesink not available - install gstreamer1.0-plugins-bad")
	}

	var pipelineStr string
	if config.UseHardware {
		videoDevice := config.VideoDevice
		if videoDevice == "" {
			videoDevice = "/dev/video0"
		}
		pipelineStr = fmt.Sprintf("v4l2src device=%s ! video/x-raw,width=640,height=480,framerate=30/1 ! videoconvert ! gtk4paintablesink name=sink", videoDevice)
	} else {
		pipelineStr = "videotestsrc ! gtk4paintablesink name=sink"
	}

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return nil, fmt.Errorf("element is not a pipeline")
	}

	var paintableObj *gdk.Paintable
	iter := pipeline.IterateElements()
	for {
		value, result := iter.Next()
		if result != gst.IteratorOK {
			break
		}
		goValue := value.GoValue()
		if elem, ok := goValue.(*gst.Element); ok {
			if elem.Name() == "sink" {
				paintableObj = extractPaintable(elem)
				break
			}
		}
	}

	if paintableObj == nil {
		return nil, fmt.Errorf("failed to get paintable from sink")
	}

	return &EmbeddedPipeline{
		pipeline:    pipeline,
		state:       StateStopped,
		useHardware: config.UseHardware,
		videoDevice: config.VideoDevice,
		paintable:   paintableObj,
	}, nil
}

func extractPaintable(element *gst.Element) *gdk.Paintable {
	obj := glib.InternObject(element)
	value := obj.ObjectProperty("paintable")
	if value == nil {
		return nil
	}

	switch v := value.(type) {
	case *gdk.Paintable:
		return v
	case gdk.Paintabler:
		if p, ok := v.(*gdk.Paintable); ok {
			return p
		}
	}
	return nil
}

func NewEmbeddedPreviewPipelineWithFallback(config PreviewConfig) (*EmbeddedPipeline, error) {
	if !HasGtk4PaintableSink() {
		return nil, fmt.Errorf("gtk4paintablesink not available")
	}
	return NewEmbeddedPreviewPipeline(config)
}

func (p *EmbeddedPipeline) Paintable() gdk.Paintabler {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.paintable
}

func (p *EmbeddedPipeline) Start() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.pipeline.SetState(gst.StatePlaying)
	p.state = StatePlaying
}

func (p *EmbeddedPipeline) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.pipeline.SetState(gst.StateNull)
	p.state = StateStopped
}

func (p *EmbeddedPipeline) Pause() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.pipeline.SetState(gst.StatePaused)
	p.state = StatePaused
}

func (p *EmbeddedPipeline) GetState() PipelineState {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.state
}

func (p *EmbeddedPipeline) UsesHardware() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.useHardware
}

func init() {
	gst.Init()
}
