package sync

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"verbal/internal/ai"
)

// Mock implementations for testing

type mockPositionMonitor struct {
	callbacks []func(position float64)
	mu        sync.RWMutex
	started   bool
}

func newMockPositionMonitor() *mockPositionMonitor {
	return &mockPositionMonitor{
		callbacks: make([]func(position float64), 0),
	}
}

func (m *mockPositionMonitor) RegisterCallback(cb func(position float64)) func() {
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

func (m *mockPositionMonitor) Start() {
	m.mu.Lock()
	m.started = true
	m.mu.Unlock()
}

func (m *mockPositionMonitor) Stop() {
	m.mu.Lock()
	m.started = false
	m.mu.Unlock()
}

func (m *mockPositionMonitor) IsStarted() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.started
}

func (m *mockPositionMonitor) EmitPosition(position float64) {
	m.mu.RLock()
	callbacks := make([]func(position float64), len(m.callbacks))
	copy(callbacks, m.callbacks)
	m.mu.RUnlock()

	for _, cb := range callbacks {
		cb(position)
	}
}

type mockWordHighlighter struct {
	highlightedIndex int
	mu               sync.RWMutex
}

func newMockWordHighlighter() *mockWordHighlighter {
	return &mockWordHighlighter{
		highlightedIndex: -1,
	}
}

func (m *mockWordHighlighter) SetHighlightedWord(index int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.highlightedIndex = index
}

func (m *mockWordHighlighter) GetHighlightedWord() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.highlightedIndex
}

type mockPlaybackController struct {
	position   float64
	seekCount  atomic.Int32
	playCount  atomic.Int32
	pauseCount atomic.Int32
	mu         sync.RWMutex
}

func newMockPlaybackController() *mockPlaybackController {
	return &mockPlaybackController{
		position: -1,
	}
}

func (m *mockPlaybackController) Play() {
	m.playCount.Add(1)
}

func (m *mockPlaybackController) Pause() {
	m.pauseCount.Add(1)
}

func (m *mockPlaybackController) SeekTo(position float64) bool {
	m.seekCount.Add(1)
	m.mu.Lock()
	m.position = position
	m.mu.Unlock()
	return true
}

func (m *mockPlaybackController) QueryPosition() float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.position
}

type mockWaveformUpdater struct {
	position float64
	mu       sync.RWMutex
}

func newMockWaveformUpdater() *mockWaveformUpdater {
	return &mockWaveformUpdater{}
}

func (m *mockWaveformUpdater) UpdatePosition(position float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.position = position
}

func (m *mockWaveformUpdater) GetPosition() float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.position
}

func TestNewIntegration(t *testing.T) {
	result := &ai.TranscriptionResult{
		Words: []ai.Word{
			{Text: "Hello", Start: 0.0, End: 0.5},
			{Text: "world", Start: 0.6, End: 1.0},
		},
	}

	controller := NewController(result)
	monitor := newMockPositionMonitor()
	highlighter := newMockWordHighlighter()
	player := newMockPlaybackController()

	waveform := newMockWaveformUpdater()
	integration := NewIntegration(controller, monitor, highlighter, waveform, player)

	if integration == nil {
		t.Fatal("NewIntegration returned nil")
	}

	if integration.IsRunning() {
		t.Error("Integration should not be running initially")
	}

	if integration.GetController() != controller {
		t.Error("GetController should return the provided controller")
	}
}

func TestIntegration_StartStop(t *testing.T) {
	result := &ai.TranscriptionResult{
		Words: []ai.Word{
			{Text: "Hello", Start: 0.0, End: 0.5},
		},
	}

	controller := NewController(result)
	monitor := newMockPositionMonitor()
	highlighter := newMockWordHighlighter()
	player := newMockPlaybackController()

	waveform := newMockWaveformUpdater()
	integration := NewIntegration(controller, monitor, highlighter, waveform, player)

	// Test Start
	integration.Start()
	if !integration.IsRunning() {
		t.Error("Integration should be running after Start()")
	}
	if !monitor.IsStarted() {
		t.Error("Monitor should be started")
	}

	// Starting again should be no-op
	integration.Start()
	if !integration.IsRunning() {
		t.Error("Integration should still be running")
	}

	// Test Stop
	integration.Stop()
	if integration.IsRunning() {
		t.Error("Integration should not be running after Stop()")
	}
	if monitor.IsStarted() {
		t.Error("Monitor should be stopped")
	}

	// Stopping again should be no-op
	integration.Stop()
	if integration.IsRunning() {
		t.Error("Integration should still not be running")
	}
}

func TestIntegration_PositionUpdate(t *testing.T) {
	result := &ai.TranscriptionResult{
		Words: []ai.Word{
			{Text: "Hello", Start: 0.0, End: 0.5},
			{Text: "world", Start: 0.6, End: 1.0},
		},
	}

	controller := NewController(result)
	monitor := newMockPositionMonitor()
	highlighter := newMockWordHighlighter()
	player := newMockPlaybackController()

	waveform := newMockWaveformUpdater()
	integration := NewIntegration(controller, monitor, highlighter, waveform, player)
	integration.Start()
	defer integration.Stop()

	// Emit a position update
	monitor.EmitPosition(0.3)

	// Wait for callback to be processed
	time.Sleep(50 * time.Millisecond)

	// Controller should have the position
	if controller.GetCurrentPosition() != 0.3 {
		t.Errorf("Expected position 0.3, got %f", controller.GetCurrentPosition())
	}
}

func TestIntegration_PositionUpdateTracksCurrentWordIndex(t *testing.T) {
	result := &ai.TranscriptionResult{
		Words: []ai.Word{
			{Text: "Hello", Start: 0.0, End: 0.5},
			{Text: "world", Start: 0.6, End: 1.0},
		},
	}

	controller := NewController(result)
	monitor := newMockPositionMonitor()
	highlighter := newMockWordHighlighter()
	player := newMockPlaybackController()

	waveform := newMockWaveformUpdater()
	integration := NewIntegration(controller, monitor, highlighter, waveform, player)
	integration.Start()
	defer integration.Stop()

	// Wait for highlight callback registration
	time.Sleep(50 * time.Millisecond)

	// Emit position that should highlight first word
	monitor.EmitPosition(0.2)
	time.Sleep(100 * time.Millisecond) // Allow glib.IdleAdd to process

	// We assert controller-side word tracking, which is deterministic here even
	// when GTK idle callbacks are not pumped in this test context.
	if controller.GetCurrentWordIndexCached() != 0 {
		t.Errorf("Expected word index 0, got %d", controller.GetCurrentWordIndexCached())
	}
}

func TestIntegration_HandleWordClick(t *testing.T) {
	result := &ai.TranscriptionResult{
		Words: []ai.Word{
			{Text: "Hello", Start: 0.0, End: 0.5},
			{Text: "world", Start: 0.6, End: 1.0},
		},
	}

	controller := NewController(result)
	monitor := newMockPositionMonitor()
	highlighter := newMockWordHighlighter()
	player := newMockPlaybackController()

	waveform := newMockWaveformUpdater()
	integration := NewIntegration(controller, monitor, highlighter, waveform, player)
	integration.Start()
	defer integration.Stop()

	// Simulate word click
	integration.HandleWordClick(0.6, 1)

	// Verify player was seeked
	if player.seekCount.Load() != 1 {
		t.Errorf("Expected 1 seek, got %d", player.seekCount.Load())
	}

	if player.QueryPosition() != 0.6 {
		t.Errorf("Expected position 0.6, got %f", player.QueryPosition())
	}

	// Controller should be updated immediately
	if controller.GetCurrentPosition() != 0.6 {
		t.Errorf("Expected controller position 0.6, got %f", controller.GetCurrentPosition())
	}

	if controller.GetCurrentWordIndexCached() != 1 {
		t.Errorf("Expected word index 1, got %d", controller.GetCurrentWordIndexCached())
	}
}

func TestIntegration_GetCurrentPosition(t *testing.T) {
	result := &ai.TranscriptionResult{
		Words: []ai.Word{
			{Text: "Hello", Start: 0.0, End: 0.5},
		},
	}

	controller := NewController(result)
	monitor := newMockPositionMonitor()
	highlighter := newMockWordHighlighter()
	player := newMockPlaybackController()

	waveform := newMockWaveformUpdater()
	integration := NewIntegration(controller, monitor, highlighter, waveform, player)

	// Initially should be 0
	if integration.GetCurrentPosition() != 0 {
		t.Errorf("Expected initial position 0, got %f", integration.GetCurrentPosition())
	}

	// Update position via controller
	controller.UpdatePosition(1.5)

	if integration.GetCurrentPosition() != 1.5 {
		t.Errorf("Expected position 1.5, got %f", integration.GetCurrentPosition())
	}
}

func TestIntegration_GetCurrentWordIndex(t *testing.T) {
	result := &ai.TranscriptionResult{
		Words: []ai.Word{
			{Text: "Hello", Start: 0.0, End: 0.5},
			{Text: "world", Start: 0.6, End: 1.0},
		},
	}

	controller := NewController(result)
	monitor := newMockPositionMonitor()
	highlighter := newMockWordHighlighter()
	player := newMockPlaybackController()

	waveform := newMockWaveformUpdater()
	integration := NewIntegration(controller, monitor, highlighter, waveform, player)

	// Initially should be -1 (no word)
	if integration.GetCurrentWordIndex() != -1 {
		t.Errorf("Expected initial word index -1, got %d", integration.GetCurrentWordIndex())
	}

	// Update position to second word
	controller.UpdatePosition(0.7)

	if integration.GetCurrentWordIndex() != 1 {
		t.Errorf("Expected word index 1, got %d", integration.GetCurrentWordIndex())
	}
}

func TestIntegration_HandleWordClick_NilPlayer(t *testing.T) {
	result := &ai.TranscriptionResult{
		Words: []ai.Word{
			{Text: "Hello", Start: 0.0, End: 0.5},
		},
	}

	controller := NewController(result)
	monitor := newMockPositionMonitor()
	highlighter := newMockWordHighlighter()
	waveform := newMockWaveformUpdater()

	// Create integration with nil player
	integration := NewIntegration(controller, monitor, highlighter, waveform, nil)
	integration.Start()
	defer integration.Stop()

	initialPosition := controller.GetCurrentPosition()

	// Nil player should no-op without mutating controller state.
	integration.HandleWordClick(0.5, 0)
	if controller.GetCurrentPosition() != initialPosition {
		t.Errorf("expected position to remain %f, got %f", initialPosition, controller.GetCurrentPosition())
	}
	if controller.GetCurrentWordIndexCached() != -1 {
		t.Errorf("expected cached word index to remain -1, got %d", controller.GetCurrentWordIndexCached())
	}
}

func TestIntegration_MultiplePositionUpdates(t *testing.T) {
	result := &ai.TranscriptionResult{
		Words: []ai.Word{
			{Text: "One", Start: 0.0, End: 0.5},
			{Text: "Two", Start: 0.6, End: 1.0},
			{Text: "Three", Start: 1.1, End: 1.5},
		},
	}

	controller := NewController(result)
	monitor := newMockPositionMonitor()
	highlighter := newMockWordHighlighter()
	player := newMockPlaybackController()

	waveform := newMockWaveformUpdater()
	integration := NewIntegration(controller, monitor, highlighter, waveform, player)
	integration.Start()
	defer integration.Stop()

	// Emit multiple position updates
	positions := []float64{0.2, 0.7, 1.2}
	for _, pos := range positions {
		monitor.EmitPosition(pos)
	}

	time.Sleep(50 * time.Millisecond)

	// Final position should be set
	if controller.GetCurrentPosition() != 1.2 {
		t.Errorf("Expected final position 1.2, got %f", controller.GetCurrentPosition())
	}

	// Should be highlighting third word
	if controller.GetCurrentWordIndexCached() != 2 {
		t.Errorf("Expected word index 2, got %d", controller.GetCurrentWordIndexCached())
	}
}
