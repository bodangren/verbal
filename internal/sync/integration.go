// Package sync provides synchronization between video playback and transcription highlighting.
package sync

import (
	"sync"

	"github.com/diamondburned/gotk4/pkg/core/glib"
)

// PlaybackController provides a unified interface for playback control.
// This interface abstracts the video player for use with the sync integration.
type PlaybackController interface {
	// Play starts or resumes playback.
	Play()

	// Pause pauses playback.
	Pause()

	// SeekTo seeks to the specified position in seconds.
	// Returns true if the seek was successful.
	SeekTo(position float64) bool

	// QueryPosition returns the current playback position in seconds.
	// Returns -1 if the position cannot be determined.
	QueryPosition() float64
}

// WordHighlighter provides an interface for highlighting words in the UI.
type WordHighlighter interface {
	// SetHighlightedWord sets the highlighted state for a specific word by index.
	// Pass -1 to clear all highlights.
	SetHighlightedWord(index int)

	// GetHighlightedWord returns the index of the currently highlighted word,
	// or -1 if no word is highlighted.
	GetHighlightedWord() int
}

// Integration manages the complete video-transcription synchronization system.
// It wires together the position monitor, sync controller, and word highlighting UI.
//
// The integration handles:
//   - Position polling from the video player (via PositionMonitor)
//   - Word lookup based on current position (via SyncController)
//   - UI highlighting updates (via WordHighlighter)
//   - Click-to-seek from words to video position
//
// Thread safety: All methods are safe for concurrent use.
type Integration struct {
	controller  *Controller
	monitor     PositionMonitorInterface
	highlighter WordHighlighter
	player      PlaybackController

	mu      sync.RWMutex
	running bool

	// Internal callbacks (stored for cleanup)
	positionUnregister func()
	wordUnregister     func()
}

// PositionMonitorInterface defines the interface needed from a position monitor.
type PositionMonitorInterface interface {
	// RegisterCallback adds a callback to be invoked on each position update.
	RegisterCallback(cb func(position float64)) func()

	// Start begins position polling.
	Start()

	// Stop halts position polling.
	Stop()
}

// NewIntegration creates a new sync integration with the given components.
//
// Parameters:
//   - controller: The sync controller with transcription data
//   - monitor: The position monitor polling the video player
//   - highlighter: The UI component for word highlighting
//   - player: The video player for seeking on word clicks
//
// Example:
//
//	integration := sync.NewIntegration(
//	    syncController,
//	    positionMonitor,
//	    wordContainer,
//	    playbackPipeline,
//	)
//	integration.Start()
//	defer integration.Stop()
func NewIntegration(
	controller *Controller,
	monitor PositionMonitorInterface,
	highlighter WordHighlighter,
	player PlaybackController,
) *Integration {
	return &Integration{
		controller:  controller,
		monitor:     monitor,
		highlighter: highlighter,
		player:      player,
		running:     false,
	}
}

// Start begins synchronization.
// This registers callbacks and starts the position monitor.
func (i *Integration) Start() {
	i.mu.Lock()
	defer i.mu.Unlock()

	if i.running {
		return
	}

	// Register position callback to update controller
	i.positionUnregister = i.monitor.RegisterCallback(func(position float64) {
		// Update sync controller with new position
		// This runs on the monitor's goroutine, controller handles thread safety
		i.controller.UpdatePosition(position)
	})

	// Register word change callback to update UI
	i.wordUnregister = i.controller.RegisterWordChangeCallback(func(wordIdx int) {
		// Update UI from main thread (GTK requires this)
		glib.IdleAdd(func() {
			if i.highlighter != nil {
				i.highlighter.SetHighlightedWord(wordIdx)
			}
		})
	})

	i.running = true
	i.monitor.Start()
}

// Stop halts synchronization.
// This stops the position monitor and unregisters callbacks.
func (i *Integration) Stop() {
	i.mu.Lock()
	defer i.mu.Unlock()

	if !i.running {
		return
	}

	i.monitor.Stop()

	if i.positionUnregister != nil {
		i.positionUnregister()
		i.positionUnregister = nil
	}

	if i.wordUnregister != nil {
		i.wordUnregister()
		i.wordUnregister = nil
	}

	i.running = false
}

// IsRunning returns true if synchronization is active.
func (i *Integration) IsRunning() bool {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return i.running
}

// HandleWordClick handles a click on a word at the given start time.
// This seeks the video player to the word's position and updates the sync state.
//
// This method should be called from the word container's click handler.
// It is safe to call from any thread (GTK callbacks run on main thread).
func (i *Integration) HandleWordClick(startTime float64, wordIndex int) {
	i.mu.RLock()
	player := i.player
	controller := i.controller
	i.mu.RUnlock()

	if player == nil {
		return
	}

	// Seek the video player
	player.SeekTo(startTime)

	// Immediately update the sync controller
	// This ensures the highlight updates without waiting for next poll
	controller.UpdatePosition(startTime)
}

// GetController returns the sync controller.
func (i *Integration) GetController() *Controller {
	return i.controller
}

// GetCurrentPosition returns the last known playback position.
func (i *Integration) GetCurrentPosition() float64 {
	return i.controller.GetCurrentPosition()
}

// GetCurrentWordIndex returns the index of the currently active word.
func (i *Integration) GetCurrentWordIndex() int {
	return i.controller.GetCurrentWordIndexCached()
}
