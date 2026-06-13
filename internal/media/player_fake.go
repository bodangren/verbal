package media

import "sync"

// FakePlayer is a fully scriptable Player implementation for testing.
// It tracks position, duration, and playback state without any GStreamer
// or OS dependencies, making it safe for parallel test execution.
//
// Configure via SetDuration and SetPlayError before exercising the
// behaviour under test.
type FakePlayer struct {
	mu       sync.RWMutex
	position float64
	duration float64
	playing  bool
	playErr  error
}

type fakePlayer = FakePlayer

// NewFakePlayer creates a FakePlayer with sensible defaults:
//   - duration: 10 s (enough headroom for seek tests)
//   - position: -1 (unknown sentinel, matching GStreamer convention)
//   - playing:  false
func NewFakePlayer() *FakePlayer {
	return &FakePlayer{
		position: -1,
		duration: 10.0,
	}
}

func newFakePlayer() *fakePlayer {
	return NewFakePlayer()
}

// SetDuration overrides the media duration returned by QueryDuration.
// Call this before SeekTo tests that need a known upper bound.
func (f *FakePlayer) SetDuration(d float64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.duration = d
}

// SetPlayError scripts an error to be returned by the next Play() call.
// Pass nil to clear a previously scripted error.
func (f *FakePlayer) SetPlayError(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.playErr = err
}

// Play starts playback. Returns a scripted error if SetPlayError was called.
func (f *FakePlayer) Play() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.playErr != nil {
		return f.playErr
	}
	f.playing = true
	return nil
}

// Pause suspends playback, preserving the current position.
func (f *FakePlayer) Pause() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.playing = false
	return nil
}

// Stop halts playback and rewinds to position 0.
func (f *FakePlayer) Stop() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.playing = false
	f.position = 0
	return nil
}

// SeekTo moves the playback head to position seconds.
// Returns false for negative positions or positions beyond duration.
func (f *FakePlayer) SeekTo(position float64) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	if position < 0 {
		return false
	}
	if position > f.duration {
		return false
	}
	f.position = position
	return true
}

// QueryPosition returns the current playback position in seconds.
// Returns -1 before the first Play or Seek.
func (f *FakePlayer) QueryPosition() float64 {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.position
}

// QueryDuration returns the configured media duration in seconds.
func (f *FakePlayer) QueryDuration() float64 {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.duration
}
