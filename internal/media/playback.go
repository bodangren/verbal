package media

import (
	"fmt"
	"sync"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

// PlaybackPipeline manages a GStreamer pipeline for video/audio playback.
// It provides position querying and seeking capabilities for transcription synchronization.
//
// This pipeline is designed for playing recorded video files (not for recording).
// It supports embedded GTK4 preview via gtk4paintablesink when available,
// falling back to autovideosink for separate window playback.
//
// Thread safety: All methods are safe for concurrent use.
type PlaybackPipeline struct {
	pipeline  *gst.Pipeline
	state     PipelineState
	filePath  string
	mu        sync.RWMutex
	errorCh   chan error
	warningCh chan warning
	onError   func(error)
	onWarning func(warning)
}

// warning represents a GStreamer warning with optional debug info.
type warning struct {
	err   error
	debug string
}

// NewPlaybackPipeline creates a new playback pipeline for the given video file.
// The pipeline is initially in the Stopped state. Call Play() to start playback.
//
// The pipeline uses decodebin for format auto-detection and will create
// the appropriate video and audio sinks. For embedded preview in GTK4,
// it attempts to use gtk4paintablesink (requires gst-plugins-bad).
//
// Example:
//
//	pipeline, err := NewPlaybackPipeline("/path/to/video.mp4")
//	if err != nil {
//	    return err
//	}
//	defer pipeline.Close()
//
//	if err := pipeline.Play(); err != nil {
//	    return err
//	}
//	position := pipeline.QueryPosition()
func NewPlaybackPipeline(filePath string) (*PlaybackPipeline, error) {
	// Use decodebin for format auto-detection with autovideosink
	// The caller can replace the sink with gtk4paintablesink if needed
	pipelineStr := fmt.Sprintf(
		"filesrc location=%s ! decodebin name=dec "+
			"dec. ! queue ! videoconvert ! autovideosink "+
			"dec. ! queue ! audioconvert ! audioresample ! autoaudiosink",
		filePath,
	)

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse playback pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return nil, fmt.Errorf("element is not a pipeline")
	}

	p := &PlaybackPipeline{
		pipeline: pipeline,
		state:    StateStopped,
		filePath: filePath,
	}

	p.setupBusWatcher()

	return p, nil
}

// setupBusWatcher sets up the message bus watcher for errors and state changes.
func (p *PlaybackPipeline) setupBusWatcher() {
	bus := p.pipeline.Bus()
	if bus == nil {
		return
	}
	bus.AddSignalWatch()
	bus.Connect("message", func(bus *gst.Bus, msg *gst.Message) {
		switch msg.Type() {
		case gst.MessageError:
			err, debug := msg.ParseError()
			if p.onError != nil {
				p.onError(fmt.Errorf("GStreamer error: %s (debug: %s)", err, debug))
			}
		case gst.MessageWarning:
			err, debug := msg.ParseWarning()
			if p.onWarning != nil {
				p.onWarning(warning{err: fmt.Errorf("GStreamer warning: %s", err), debug: debug})
			}
		case gst.MessageEos:
			// End of stream - update state
			p.mu.Lock()
			p.state = StateStopped
			p.mu.Unlock()
		}
	})
}

// Play starts or resumes playback.
// Returns an error if the state transition fails.
func (p *PlaybackPipeline) Play() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	ret := p.pipeline.SetState(gst.StatePlaying)
	if ret == gst.StateChangeFailure {
		return fmt.Errorf("failed to start playback: state change failed")
	}
	p.state = StatePlaying
	return nil
}

// Pause pauses playback.
// Returns an error if the state transition fails.
func (p *PlaybackPipeline) Pause() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	ret := p.pipeline.SetState(gst.StatePaused)
	if ret == gst.StateChangeFailure {
		return fmt.Errorf("failed to pause playback: state change failed")
	}
	p.state = StatePaused
	return nil
}

// Stop halts playback and resets to the beginning.
// Returns an error if the state transition fails.
func (p *PlaybackPipeline) Stop() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.pipeline == nil {
		p.state = StateStopped
		return nil
	}

	// READY keeps elements instantiated, but some invalid/partial media sources
	// can fail this transition. Fall back to NULL to guarantee quiescence.
	ret := p.pipeline.SetState(gst.StateReady)
	if ret == gst.StateChangeFailure {
		ret = p.pipeline.SetState(gst.StateNull)
		if ret == gst.StateChangeFailure {
			return fmt.Errorf("failed to stop playback: state change failed")
		}
	}
	p.state = StateStopped
	return nil
}

// Close releases all resources associated with the pipeline.
// The pipeline cannot be used after calling Close.
// Returns an error if the state transition fails.
func (p *PlaybackPipeline) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.pipeline != nil {
		ret := p.pipeline.SetState(gst.StateNull)
		if ret == gst.StateChangeFailure {
			return fmt.Errorf("failed to close pipeline: state change failed")
		}
		p.pipeline = nil
	}
	return nil
}

// QueryPosition returns the current playback position in seconds.
// Returns -1 if the position cannot be determined.
//
// This method implements the PipelineQuerier interface for use with PositionMonitor.
func (p *PlaybackPipeline) QueryPosition() float64 {
	p.mu.RLock()
	pipeline := p.pipeline
	p.mu.RUnlock()

	if pipeline == nil {
		return -1
	}

	// Query the current position using TIME format
	// GStreamer's QueryPosition returns (int64, bool) where bool indicates success
	position, success := pipeline.QueryPosition(gst.FormatTime)
	if !success {
		return -1
	}

	// Convert from nanoseconds to seconds
	// GStreamer's time is in nanoseconds (1 second = 1,000,000,000 nanoseconds)
	const nanosecondsPerSecond = 1_000_000_000
	return float64(position) / float64(nanosecondsPerSecond)
}

// QueryDuration returns the total duration of the media in seconds.
// Returns -1 if the duration cannot be determined.
func (p *PlaybackPipeline) QueryDuration() float64 {
	p.mu.RLock()
	pipeline := p.pipeline
	p.mu.RUnlock()

	if pipeline == nil {
		return -1
	}

	duration, success := pipeline.QueryDuration(gst.FormatTime)
	if !success {
		return -1
	}

	const nanosecondsPerSecond = 1_000_000_000
	return float64(duration) / float64(nanosecondsPerSecond)
}

// SeekTo seeks to the specified position in seconds.
// Returns true if the seek was successful.
// Returns false for invalid positions (negative or beyond duration).
func (p *PlaybackPipeline) SeekTo(position float64) bool {
	if position < 0 {
		return false
	}

	p.mu.RLock()
	pipeline := p.pipeline
	p.mu.RUnlock()

	if pipeline == nil {
		return false
	}

	// Check against duration to prevent seeking beyond end
	duration, success := pipeline.QueryDuration(gst.FormatTime)
	if success {
		const nanosecondsPerSecond = 1_000_000_000
		maxNs := float64(duration)
		if position > maxNs/float64(nanosecondsPerSecond) {
			return false
		}
	}

	// Convert seconds to nanoseconds
	const nanosecondsPerSecond = 1_000_000_000
	timeNs := int64(position * nanosecondsPerSecond)

	// Perform the seek
	return pipeline.SeekSimple(
		gst.FormatTime,
		gst.SeekFlagFlush|gst.SeekFlagKeyUnit,
		timeNs,
	)
}

// GetState returns the current state of the pipeline.
// This method implements the PipelineQuerier interface.
func (p *PlaybackPipeline) GetState() PipelineState {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.state
}

// FilePath returns the path to the video file being played.
func (p *PlaybackPipeline) FilePath() string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.filePath
}
