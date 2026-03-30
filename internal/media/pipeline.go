package media

import (
	"fmt"
	"sync"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
	"github.com/diamondburned/gotk4/pkg/core/glib"
)

type Pipeline struct {
	pipeline    *gst.Pipeline
	state       PipelineState
	isRecording bool
	useHardware bool
	outputPath  string
	mu          sync.RWMutex
}

func NewUnifiedPipeline(outputPath string, useHardware bool) (*Pipeline, error) {
	var pipelineStr string

	if useHardware {
		videoDevice, _ := GetDefaultVideoDevice()
		devicePath := "/dev/video0"
		if videoDevice != nil {
			devicePath = videoDevice.Path
		}

		pipelineStr = fmt.Sprintf(
			"v4l2src device=%s ! video/x-raw,width=640,height=480,framerate=30/1 ! videoconvert ! videoflip method=horizontal-flip ! tee name=t "+
				"t. ! queue ! autovideosink "+
				"t. ! queue ! valve name=rec_valve drop=true ! x264enc tune=zerolatency ! matroskamux name=mux ! filesink name=fsink location=%s "+
				"autoaudiosrc ! audioconvert ! audioresample ! opusenc ! mux.",
			devicePath, outputPath,
		)
	} else {
		pipelineStr = fmt.Sprintf(
			"videotestsrc ! video/x-raw,width=640,height=480,framerate=30/1 ! videoconvert ! tee name=t "+
				"t. ! queue ! autovideosink "+
				"t. ! queue ! valve name=rec_valve drop=true ! x264enc tune=zerolatency ! matroskamux name=mux ! filesink name=fsink location=%s "+
				"audiotestsrc ! audioconvert ! audioresample ! opusenc ! mux.",
			outputPath,
		)
	}

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse unified pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return nil, fmt.Errorf("element is not a pipeline")
	}

	p := &Pipeline{
		pipeline:    pipeline,
		state:       StateStopped,
		useHardware: useHardware,
		outputPath:  outputPath,
	}

	p.setupBusWatcher()

	return p, nil
}

func (p *Pipeline) setupBusWatcher() {
	bus := p.pipeline.Bus()
	if bus == nil {
		return
	}
	bus.AddSignalWatch()
	bus.Connect("message", func(bus *gst.Bus, msg *gst.Message) {
		switch msg.Type() {
		case gst.MessageError:
			err, debug := msg.ParseError()
			fmt.Printf("GStreamer Error: %s (Debug: %s)\n", err, debug)
		case gst.MessageWarning:
			err, debug := msg.ParseWarning()
			fmt.Printf("GStreamer Warning: %s (Debug: %s)\n", err, debug)
		}
	})
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

func (p *Pipeline) StartRecording() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	valver := p.pipeline.ByName("rec_valve")
	if valver == nil {
		return fmt.Errorf("could not find recording valve")
	}

	valve, ok := valver.(*gst.Element)
	if !ok {
		return fmt.Errorf("rec_valve is not an element")
	}

	fmt.Println("Opening valve for recording...")
	glib.InternObject(valve).SetObjectProperty("drop", false)
	p.isRecording = true
	return nil
}

func (p *Pipeline) StopRecording() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	valver := p.pipeline.ByName("rec_valve")
	if valver == nil {
		return fmt.Errorf("could not find recording valve")
	}

	valve, ok := valver.(*gst.Element)
	if !ok {
		return fmt.Errorf("rec_valve is not an element")
	}

	fmt.Println("Closing valve, stopping recording...")
	glib.InternObject(valve).SetObjectProperty("drop", true)
	p.isRecording = false
	return nil
}

func (p *Pipeline) GetState() PipelineState {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.state
}

func (p *Pipeline) IsRecording() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.isRecording
}

func (p *Pipeline) UsesHardware() bool {
	return p.useHardware
}

func (p *Pipeline) OutputPath() string {
	return p.outputPath
}

func init() {
	gst.Init()
}
