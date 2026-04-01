// Package media provides GStreamer-based media handling for the Verbal application.
package media

import (
	"sync"
	"time"
)

// PositionMonitor polls a media pipeline for position updates at regular intervals.
// It is designed to work with GStreamer pipelines to provide position updates
// for transcription synchronization at ~10fps (100ms intervals).
//
// The monitor runs in a separate goroutine and emits position updates via callbacks.
// It can be started and stopped multiple times, and will not emit updates
// when the underlying pipeline is not in a playing state.
//
// Thread safety: All methods are safe for concurrent use.
type PositionMonitor struct {
	pipeline     PipelineQuerier
	interval     time.Duration
	callbacks    []func(position float64)
	mu           sync.RWMutex
	stopChan     chan struct{}
	running      bool
	lastPosition float64
}

// PipelineQuerier defines the interface required for position monitoring.
// This interface is implemented by GStreamer pipeline wrappers.
type PipelineQuerier interface {
	// QueryPosition returns the current playback position in seconds.
	// Returns -1 if the position cannot be determined.
	QueryPosition() float64

	// GetState returns the current state of the pipeline.
	GetState() PipelineState
}

// NewPositionMonitor creates a new position monitor for the given pipeline.
// The interval parameter controls the polling rate (default 100ms for 10fps).
//
// Example:
//
//	monitor := NewPositionMonitor(pipeline, 100*time.Millisecond)
//	monitor.RegisterCallback(func(pos float64) {
//	    syncController.UpdatePosition(pos)
//	})
//	monitor.Start()
//	defer monitor.Stop()
func NewPositionMonitor(pipeline PipelineQuerier, interval time.Duration) *PositionMonitor {
	if interval <= 0 {
		interval = 100 * time.Millisecond // Default 10fps
	}

	return &PositionMonitor{
		pipeline:     pipeline,
		interval:     interval,
		callbacks:    make([]func(position float64), 0),
		stopChan:     make(chan struct{}),
		running:      false,
		lastPosition: -1,
	}
}

// RegisterCallback adds a callback to be invoked on each position update.
// Returns a function that can be called to unregister the callback.
//
// Callbacks are invoked from the monitor's internal goroutine.
// For GTK UI updates, use glib.IdleAdd() within the callback.
func (m *PositionMonitor) RegisterCallback(cb func(position float64)) func() {
	m.mu.Lock()
	m.callbacks = append(m.callbacks, cb)
	idx := len(m.callbacks) - 1
	m.mu.Unlock()

	return func() {
		m.mu.Lock()
		if idx < len(m.callbacks) {
			m.callbacks = append(m.callbacks[:idx], m.callbacks[idx+1:]...)
		}
		m.mu.Unlock()
	}
}

// Start begins position polling.
// If the monitor is already running, this method has no effect.
// The monitor runs until Stop() is called.
func (m *PositionMonitor) Start() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.running {
		return
	}

	m.running = true
	m.stopChan = make(chan struct{})

	go m.pollLoop()
}

// Stop halts position polling.
// If the monitor is not running, this method has no effect.
// This method blocks until the polling goroutine has stopped.
func (m *PositionMonitor) Stop() {
	m.mu.Lock()
	if !m.running {
		m.mu.Unlock()
		return
	}

	m.running = false
	close(m.stopChan)
	m.mu.Unlock()
}

// IsRunning returns true if the monitor is currently polling.
func (m *PositionMonitor) IsRunning() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.running
}

// GetLastPosition returns the last known position from the pipeline.
// Returns -1 if no position has been queried yet.
func (m *PositionMonitor) GetLastPosition() float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.lastPosition
}

// pollLoop is the main polling loop running in a separate goroutine.
// It polls the pipeline position at the configured interval and emits callbacks.
func (m *PositionMonitor) pollLoop() {
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			m.pollOnce()
		case <-m.stopChan:
			return
		}
	}
}

// pollOnce performs a single position query and emits callbacks if appropriate.
// This is called from the pollLoop goroutine.
func (m *PositionMonitor) pollOnce() {
	// Only emit updates when pipeline is playing
	if m.pipeline.GetState() != StatePlaying {
		return
	}

	position := m.pipeline.QueryPosition()
	if position < 0 {
		return
	}

	m.mu.Lock()
	m.lastPosition = position
	callbacks := make([]func(position float64), len(m.callbacks))
	copy(callbacks, m.callbacks)
	m.mu.Unlock()

	// Invoke callbacks
	for _, cb := range callbacks {
		cb(position)
	}
}
