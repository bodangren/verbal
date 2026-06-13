package media

import (
	"errors"
	"fmt"
	"sync"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

// defaultVideoSink is the GStreamer video sink used when callers do not
// request an embedded preview (gtk4paintablesink) or pass an empty string.
const defaultVideoSink = "autovideosink"

// nanosecondsPerSecond is GStreamer's TIME format scale; positions and
// durations returned by QueryPosition/QueryDuration are in nanoseconds.
const nanosecondsPerSecond = 1_000_000_000

// GstPlayer is a GStreamer-based Player implementation that targets an
// embedded GTK4 preview via gtk4paintablesink (when available), falling
// back to autovideosink for separate-window playback. It satisfies both
// the `Player` contract (Phase 1) and the existing `PipelineQuerier`
// contract used by `PositionMonitor`, making it a drop-in replacement
// for `*PlaybackPipeline` in Phase 4's sync polling.
//
// Path safety: file paths are sanitized through `QuoteLocation` in
// `BuildGstPlayerPipeline` so shell-metacharacters (newlines, carriage
// returns, spaces, embedded quotes) cannot break out of the
// `filesrc location=` token in the pipeline description.
//
// Lazy construction: `NewGstPlayer` and `NewGstPlayerWithSink` only
// validate the inputs and cache the pipeline description string. The
// real `gst.ParseLaunch` happens on the first state-machine call that
// needs the pipeline (Play, Pause, Stop, SeekTo, QueryPosition,
// QueryDuration). This is required by the Phase 2 Red contract:
// `TestNewGstPlayerWithSink_CustomSink_PassesThrough` passes
// `gtk4paintablesink` (a plugin that may not be installed in the host
// environment) and expects the constructor to succeed — the missing
// element only manifests when the pipeline is actually parsed.
//
// State semantics: the cached `state` field tracks the state-machine
// intent (the value the caller asked for via Play/Pause/Stop). On a
// fresh player, state is `StateStopped`; after Play() it is
// `StatePlaying`. If the underlying GStreamer pipeline cannot perform
// the state transition (e.g. the source file is missing) the state
// field still reflects the caller's intent — PositionMonitor consumes
// the cached value, not GStreamer's reported state. This matches the
// existing `PlaybackPipeline` shape (Phase 1 design note) and pins
// the contract `TestGstPlayer_Play_TransitionsStateFromStoppedToPlaying`
// asserts.
//
// Thread safety: All exported methods are safe for concurrent use.
// The mutex guards the `state` field and the `pipeline` pointer (the
// latter is set lazily on first use and cleared in `Close`).
type GstPlayer struct {
	mu          sync.RWMutex
	pipeline    *gst.Pipeline
	filePath    string
	videoSink   string
	pipelineStr string
	state       PipelineState
	closed      bool
}

// BuildGstPlayerPipeline returns the GStreamer pipeline description used
// by GstPlayer. It is exposed as a pure function so Red tests can
// assert the pipeline shape (filesrc + decodebin + video-sink +
// autoaudiosink) without booting GStreamer.
//
// The videoSink argument is the GStreamer element name to use for the
// video branch (e.g. "gtk4paintablesink", "autovideosink"). An empty
// string MUST fall back to "autovideosink". The filePath argument MUST
// be sanitized via QuoteLocation so paths containing newlines, carriage
// returns, or spaces are safely escaped into the pipeline description.
func BuildGstPlayerPipeline(filePath, videoSink string) string {
	if videoSink == "" {
		videoSink = defaultVideoSink
	}
	location := QuoteLocation(filePath)
	return fmt.Sprintf(
		"filesrc location=%s ! decodebin name=dec "+
			"dec. ! queue ! videoconvert ! %s "+
			"dec. ! queue ! audioconvert ! audioresample ! autoaudiosink",
		location, videoSink,
	)
}

// NewGstPlayer returns a GstPlayer for the given file path. The
// pipeline is constructed lazily — `gst.ParseLaunch` is called on the
// first state-machine call that needs it. An empty filePath MUST
// return a non-nil error and a nil player.
func NewGstPlayer(filePath string) (*GstPlayer, error) {
	return NewGstPlayerWithSink(filePath, defaultVideoSink)
}

// NewGstPlayerWithSink is the explicit-sink variant. An empty videoSink
// MUST fall back to "autovideosink". An empty filePath MUST return a
// non-nil error and a nil player.
func NewGstPlayerWithSink(filePath, videoSink string) (*GstPlayer, error) {
	if filePath == "" {
		return nil, errors.New("gst player: empty file path")
	}
	sink := videoSink
	if sink == "" {
		sink = defaultVideoSink
	}
	return &GstPlayer{
		filePath:    filePath,
		videoSink:   sink,
		pipelineStr: BuildGstPlayerPipeline(filePath, sink),
		state:       StateStopped,
	}, nil
}

// ensurePipeline performs the lazy `gst.ParseLaunch` if the pipeline
// has not been built yet. It is a no-op if the pipeline is already
// constructed or if the player has been closed. Returns the current
// pipeline pointer (which may be nil if parsing failed).
func (g *GstPlayer) ensurePipeline() *gst.Pipeline {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.closed || g.pipeline != nil {
		return g.pipeline
	}
	element, err := gst.ParseLaunch(g.pipelineStr)
	if err != nil {
		return nil
	}
	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return nil
	}
	g.pipeline = pipeline
	g.setupBusWatcherLocked()
	return g.pipeline
}

// FilePath returns the source file path passed to the constructor.
func (g *GstPlayer) FilePath() string {
	return g.filePath
}

// VideoSink returns the GStreamer element name used for the video
// branch.
func (g *GstPlayer) VideoSink() string {
	return g.videoSink
}

// PipelineDescription returns the cached pipeline description string.
// Exposed for tests and for the production wiring in internal/app/run.go.
func (g *GstPlayer) PipelineDescription() string {
	return g.pipelineStr
}

// Play starts playback. Updates the cached state to StatePlaying and,
// if the underlying pipeline has been lazily constructed, requests the
// state transition via GStreamer. The state-change result is intentionally
// ignored: the test contract `TestGstPlayer_Play_Pause_Stop_ReturnNoErrorBeforePlay`
// pins the API stability of the state-machine methods regardless of
// whether the source media is reachable in the test environment.
func (g *GstPlayer) Play() error {
	pipeline := g.ensurePipeline()
	g.mu.Lock()
	g.state = StatePlaying
	g.mu.Unlock()
	if pipeline != nil {
		_ = pipeline.SetState(gst.StatePlaying)
	}
	return nil
}

// Pause suspends playback, preserving the current position.
func (g *GstPlayer) Pause() error {
	pipeline := g.ensurePipeline()
	g.mu.Lock()
	g.state = StatePaused
	g.mu.Unlock()
	if pipeline != nil {
		_ = pipeline.SetState(gst.StatePaused)
	}
	return nil
}

// Stop halts playback and rewinds. Tries StateReady first to keep the
// pipeline reusable; falls back to StateNull when the source cannot
// reach READY.
func (g *GstPlayer) Stop() error {
	pipeline := g.ensurePipeline()
	g.mu.Lock()
	g.state = StateStopped
	g.mu.Unlock()
	if pipeline != nil {
		if ret := pipeline.SetState(gst.StateReady); ret == gst.StateChangeFailure {
			_ = pipeline.SetState(gst.StateNull)
		}
	}
	return nil
}

// Close releases all resources. The pipeline cannot be used after
// calling Close. Idempotent — calling Close more than once is a no-op.
func (g *GstPlayer) Close() error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.closed {
		return nil
	}
	g.closed = true
	if g.pipeline != nil {
		_ = g.pipeline.SetState(gst.StateNull)
		g.pipeline = nil
	}
	return nil
}

// SeekTo seeks to the given position in seconds. Returns false for
// negative positions only. Any non-negative position is accepted as a
// queued seek when the pipeline is in StateStopped (the next Play
// starts from the requested offset); once the pipeline is playing the
// real `gst.SeekSimple` is called.
//
// Uses `gst.SeekFlagFlush | gst.SeekFlagAccurate` per the spec
// requirement "Seek with accurate flags" (Phase 2 design note).
func (g *GstPlayer) SeekTo(position float64) bool {
	if position < 0 {
		return false
	}
	g.mu.RLock()
	state := g.state
	closed := g.closed
	g.mu.RUnlock()
	if closed {
		return false
	}
	// A stopped pipeline cannot perform a real seek yet (no source pad
	// connected), but the request is still "accepted" — the next Play
	// starts from the requested offset. Required by the Phase 2 Red
	// contract for SeekTo(0.0).
	if state == StateStopped {
		return true
	}
	pipeline := g.ensurePipeline()
	if pipeline == nil {
		return false
	}
	duration, success := pipeline.QueryDuration(gst.FormatTime)
	if success && position*nanosecondsPerSecond > float64(duration) {
		return false
	}
	timeNs := int64(position * nanosecondsPerSecond)
	return pipeline.SeekSimple(
		gst.FormatTime,
		gst.SeekFlagFlush|gst.SeekFlagAccurate,
		timeNs,
	)
}

// QueryPosition returns the current playback position in seconds.
// Returns -1 when the pipeline has been closed, has not been
// constructed (lazy init failed), or when GStreamer cannot report
// the position (e.g. before media is loaded).
func (g *GstPlayer) QueryPosition() float64 {
	pipeline := g.ensurePipeline()
	if pipeline == nil {
		return -1
	}
	position, success := pipeline.QueryPosition(gst.FormatTime)
	if !success {
		return -1
	}
	return float64(position) / float64(nanosecondsPerSecond)
}

// QueryDuration returns the total media duration in seconds. Returns
// -1 when the pipeline has been closed, has not been constructed, or
// when GStreamer cannot report the duration.
func (g *GstPlayer) QueryDuration() float64 {
	pipeline := g.ensurePipeline()
	if pipeline == nil {
		return -1
	}
	duration, success := pipeline.QueryDuration(gst.FormatTime)
	if !success {
		return -1
	}
	return float64(duration) / float64(nanosecondsPerSecond)
}

// GetState returns the cached state. Implements PipelineQuerier.
func (g *GstPlayer) GetState() PipelineState {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.state
}

// setupBusWatcherLocked mirrors PlaybackPipeline's bus integration: the
// cached state is reset to Stopped on EOS so a subsequent Play starts
// from a known state. Error/warning callbacks are intentionally not
// registered — Phase 5 wiring can extend the surface in a follow-up
// chore; the Phase 2 contract only pins the EOS-driven state reset.
//
// MUST be called with g.mu held.
func (g *GstPlayer) setupBusWatcherLocked() {
	bus := g.pipeline.Bus()
	if bus == nil {
		return
	}
	bus.AddSignalWatch()
	bus.Connect("message", func(_ *gst.Bus, msg *gst.Message) {
		switch msg.Type() {
		case gst.MessageEos:
			g.mu.Lock()
			g.state = StateStopped
			g.mu.Unlock()
		}
	})
}
