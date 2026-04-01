// Package sync provides synchronization between video playback and transcription highlighting.
//
// The Controller manages the relationship between video playback position and
// transcription words. It uses binary search (O(log n)) for efficient word lookup
// and provides callback-based notifications for position and word changes.
//
// For Phase 3 integration (GStreamer video player):
//
//  1. Create a Controller with the transcription result
//  2. Poll video position at ~10fps from GStreamer
//  3. Call UpdatePosition() with the current playback time
//  4. Register callbacks to highlight words in the UI
//  5. Handle word clicks to seek the video player
//
// Thread safety: All methods are safe for concurrent use.
package sync

import (
	"fmt"
	"sync"

	"verbal/internal/ai"
)

// Controller manages synchronization between video position and transcription words.
// It provides efficient lookup of the current word based on playback position
// and notifies registered callbacks when the active word changes.
type Controller struct {
	words []ai.Word
	mu    sync.RWMutex

	currentWordIdx    int
	lastPosition      float64
	positionCallbacks []func(position float64)
	wordCallbacks     []func(wordIdx int)
}

// NewController creates a new sync controller for the given transcription result.
// The result may be nil, in which case the controller will have no words.
func NewController(result *ai.TranscriptionResult) *Controller {
	var words []ai.Word
	if result != nil {
		words = result.Words
	}

	return &Controller{
		words:             words,
		currentWordIdx:    -1,
		lastPosition:      0,
		positionCallbacks: make([]func(position float64), 0),
		wordCallbacks:     make([]func(wordIdx int), 0),
	}
}

// GetCurrentWordIndex returns the index of the word at the given playback position.
// Returns -1 if the position is before the first word or if there are no words.
// Uses binary search for O(log n) performance.
func (c *Controller) GetCurrentWordIndex(position float64) int {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if len(c.words) == 0 {
		return -1
	}

	// Binary search to find the word containing the position
	left, right := 0, len(c.words)-1

	for left <= right {
		mid := (left + right) / 2
		word := c.words[mid]

		if position >= word.Start && position <= word.End {
			return mid
		}

		if position < word.Start {
			right = mid - 1
		} else {
			left = mid + 1
		}
	}

	// Position is between words - return the previous word
	if right >= 0 && position >= c.words[right].Start {
		return right
	}

	// Before first word
	if left < len(c.words) && position < c.words[left].Start {
		return -1
	}

	// After last word
	return len(c.words) - 1
}

// SeekToWord returns the start timestamp for the word at the given index.
// Returns an error if the index is out of bounds.
func (c *Controller) SeekToWord(wordIdx int) (float64, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if wordIdx < 0 || wordIdx >= len(c.words) {
		return 0, fmt.Errorf("word index %d out of bounds (0-%d)", wordIdx, len(c.words)-1)
	}

	return c.words[wordIdx].Start, nil
}

// UpdatePosition notifies the controller of a new playback position.
// This triggers position callbacks and word change callbacks if the active word changes.
func (c *Controller) UpdatePosition(position float64) {
	c.mu.Lock()
	c.lastPosition = position
	c.mu.Unlock()

	// Notify position callbacks
	c.mu.RLock()
	callbacks := make([]func(position float64), len(c.positionCallbacks))
	copy(callbacks, c.positionCallbacks)
	c.mu.RUnlock()

	for _, cb := range callbacks {
		cb(position)
	}

	// Check for word change
	newWordIdx := c.GetCurrentWordIndex(position)
	c.mu.Lock()
	oldWordIdx := c.currentWordIdx
	if newWordIdx != oldWordIdx {
		c.currentWordIdx = newWordIdx
	}
	c.mu.Unlock()

	// Notify word change callbacks if needed
	if newWordIdx != oldWordIdx {
		c.mu.RLock()
		wordCallbacks := make([]func(wordIdx int), len(c.wordCallbacks))
		copy(wordCallbacks, c.wordCallbacks)
		c.mu.RUnlock()

		for _, cb := range wordCallbacks {
			cb(newWordIdx)
		}
	}
}

// RegisterPositionCallback registers a callback to be invoked when the position updates.
// Returns a function that can be called to unregister the callback.
func (c *Controller) RegisterPositionCallback(cb func(position float64)) func() {
	c.mu.Lock()
	c.positionCallbacks = append(c.positionCallbacks, cb)
	idx := len(c.positionCallbacks) - 1
	c.mu.Unlock()

	return func() {
		c.mu.Lock()
		if idx < len(c.positionCallbacks) {
			c.positionCallbacks = append(c.positionCallbacks[:idx], c.positionCallbacks[idx+1:]...)
		}
		c.mu.Unlock()
	}
}

// RegisterWordChangeCallback registers a callback to be invoked when the active word changes.
// Returns a function that can be called to unregister the callback.
func (c *Controller) RegisterWordChangeCallback(cb func(wordIdx int)) func() {
	c.mu.Lock()
	c.wordCallbacks = append(c.wordCallbacks, cb)
	idx := len(c.wordCallbacks) - 1
	c.mu.Unlock()

	return func() {
		c.mu.Lock()
		if idx < len(c.wordCallbacks) {
			c.wordCallbacks = append(c.wordCallbacks[:idx], c.wordCallbacks[idx+1:]...)
		}
		c.mu.Unlock()
	}
}

// GetWordCount returns the total number of words in the transcription.
func (c *Controller) GetWordCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.words)
}

// GetWordAt returns the word at the given index.
// Returns an error if the index is out of bounds.
func (c *Controller) GetWordAt(idx int) (ai.Word, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if idx < 0 || idx >= len(c.words) {
		return ai.Word{}, fmt.Errorf("word index %d out of bounds (0-%d)", idx, len(c.words)-1)
	}

	return c.words[idx], nil
}

// GetCurrentPosition returns the last known playback position.
func (c *Controller) GetCurrentPosition() float64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lastPosition
}

// GetCurrentWordIndexCached returns the currently active word index.
// This is the cached value from the last UpdatePosition call.
func (c *Controller) GetCurrentWordIndexCached() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.currentWordIdx
}

// UsageExample demonstrates how to use the Controller with a video player.
// This example shows the integration pattern for Phase 3 (GStreamer playback).
//
// Example:
//
//	// 1. Create controller from transcription
//	ctrl := sync.NewController(transcriptionResult)
//
//	// 2. Register word change callback to highlight in UI
//	ctrl.RegisterWordChangeCallback(func(wordIdx int) {
//	    wordContainer.SetHighlightedWord(wordIdx)
//	})
//
//	// 3. Set up position polling from GStreamer (10fps)
//	// In your position monitor goroutine:
//	go func() {
//	    ticker := time.NewTicker(100 * time.Millisecond)
//	    defer ticker.Stop()
//	    for range ticker.C {
//	        position := pipeline.GetPosition() // From GStreamer
//	        glib.IdleAdd(func() {
//	            ctrl.UpdatePosition(position)
//	        })
//	    }
//	}()
//
//	// 4. Handle word clicks to seek video
//	wordContainer.SetWordClickHandler(func(startTime float64, index int) {
//	    pipeline.Seek(startTime) // To GStreamer
//	    ctrl.UpdatePosition(startTime) // Update sync immediately
//	})
func UsageExample() {}
