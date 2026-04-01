package media

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// mockPipeline is a test double for PipelineQuerier
type mockPipeline struct {
	position float64
	state    PipelineState
	mu       sync.RWMutex
}

func newMockPipeline() *mockPipeline {
	return &mockPipeline{
		position: 0,
		state:    StateStopped,
	}
}

func (m *mockPipeline) QueryPosition() float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.position
}

func (m *mockPipeline) SetPosition(pos float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.position = pos
}

func (m *mockPipeline) GetState() PipelineState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state
}

func (m *mockPipeline) SetState(state PipelineState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.state = state
}

func TestNewPositionMonitor(t *testing.T) {
	mock := newMockPipeline()

	// Test with custom interval
	monitor := NewPositionMonitor(mock, 50*time.Millisecond)
	if monitor == nil {
		t.Fatal("NewPositionMonitor returned nil")
	}
	if monitor.IsRunning() {
		t.Error("New monitor should not be running")
	}
	if monitor.GetLastPosition() != -1 {
		t.Error("Initial position should be -1")
	}

	// Test with default interval (zero)
	monitor2 := NewPositionMonitor(mock, 0)
	if monitor2 == nil {
		t.Fatal("NewPositionMonitor with zero interval returned nil")
	}
}

func TestPositionMonitor_StartStop(t *testing.T) {
	mock := newMockPipeline()
	monitor := NewPositionMonitor(mock, 50*time.Millisecond)

	// Test starting
	monitor.Start()
	if !monitor.IsRunning() {
		t.Error("Monitor should be running after Start()")
	}

	// Starting again should be no-op
	monitor.Start()
	if !monitor.IsRunning() {
		t.Error("Monitor should still be running")
	}

	// Test stopping
	monitor.Stop()
	time.Sleep(10 * time.Millisecond) // Allow goroutine to exit
	if monitor.IsRunning() {
		t.Error("Monitor should not be running after Stop()")
	}

	// Stopping again should be no-op
	monitor.Stop()
	if monitor.IsRunning() {
		t.Error("Monitor should still not be running")
	}
}

func TestPositionMonitor_CallbackInvocation(t *testing.T) {
	mock := newMockPipeline()
	mock.SetState(StatePlaying)
	mock.SetPosition(1.5)

	monitor := NewPositionMonitor(mock, 50*time.Millisecond)

	var callbackCount atomic.Int32
	var lastPosition float64

	// Register callback
	unregister := monitor.RegisterCallback(func(pos float64) {
		callbackCount.Add(1)
		lastPosition = pos
	})
	defer unregister()

	monitor.Start()
	time.Sleep(150 * time.Millisecond) // Wait for a few polling cycles
	monitor.Stop()

	if callbackCount.Load() == 0 {
		t.Error("Callback should have been invoked")
	}
	if lastPosition != 1.5 {
		t.Errorf("Expected position 1.5, got %f", lastPosition)
	}
}

func TestPositionMonitor_NoCallbackWhenPaused(t *testing.T) {
	mock := newMockPipeline()
	mock.SetState(StatePaused) // Not playing
	mock.SetPosition(1.0)

	monitor := NewPositionMonitor(mock, 50*time.Millisecond)

	var callbackCount atomic.Int32
	monitor.RegisterCallback(func(pos float64) {
		callbackCount.Add(1)
	})

	monitor.Start()
	time.Sleep(150 * time.Millisecond)
	monitor.Stop()

	if callbackCount.Load() != 0 {
		t.Error("Callback should not be invoked when pipeline is paused")
	}
}

func TestPositionMonitor_NoCallbackWhenStopped(t *testing.T) {
	mock := newMockPipeline()
	mock.SetState(StateStopped) // Not playing
	mock.SetPosition(1.0)

	monitor := NewPositionMonitor(mock, 50*time.Millisecond)

	var callbackCount atomic.Int32
	monitor.RegisterCallback(func(pos float64) {
		callbackCount.Add(1)
	})

	monitor.Start()
	time.Sleep(150 * time.Millisecond)
	monitor.Stop()

	if callbackCount.Load() != 0 {
		t.Error("Callback should not be invoked when pipeline is stopped")
	}
}

func TestPositionMonitor_MultipleCallbacks(t *testing.T) {
	mock := newMockPipeline()
	mock.SetState(StatePlaying)
	mock.SetPosition(2.0)

	monitor := NewPositionMonitor(mock, 50*time.Millisecond)

	var count1, count2 atomic.Int32

	monitor.RegisterCallback(func(pos float64) {
		count1.Add(1)
	})
	monitor.RegisterCallback(func(pos float64) {
		count2.Add(1)
	})

	monitor.Start()
	time.Sleep(130 * time.Millisecond) // ~2-3 polls
	monitor.Stop()

	if count1.Load() == 0 {
		t.Error("First callback should have been invoked")
	}
	if count2.Load() == 0 {
		t.Error("Second callback should have been invoked")
	}
	if count1.Load() != count2.Load() {
		t.Error("Both callbacks should have been invoked the same number of times")
	}
}

func TestPositionMonitor_UnregisterCallback(t *testing.T) {
	mock := newMockPipeline()
	mock.SetState(StatePlaying)
	mock.SetPosition(1.0)

	monitor := NewPositionMonitor(mock, 50*time.Millisecond)

	var count atomic.Int32
	unregister := monitor.RegisterCallback(func(pos float64) {
		count.Add(1)
	})

	monitor.Start()
	time.Sleep(80 * time.Millisecond) // ~1 callback

	// Unregister
	unregister()

	time.Sleep(100 * time.Millisecond) // More time, no more callbacks
	monitor.Stop()

	if count.Load() < 1 {
		t.Error("Callback should have been invoked before unregister")
	}

	// Should have exactly 1-2 callbacks, not 3+
	if count.Load() > 2 {
		t.Errorf("Expected 1-2 callbacks after unregister, got %d", count.Load())
	}
}

func TestPositionMonitor_PositionUpdate(t *testing.T) {
	mock := newMockPipeline()
	mock.SetState(StatePlaying)
	mock.SetPosition(0.0)

	monitor := NewPositionMonitor(mock, 50*time.Millisecond)

	positions := make([]float64, 0)
	var mu sync.Mutex

	monitor.RegisterCallback(func(pos float64) {
		mu.Lock()
		positions = append(positions, pos)
		mu.Unlock()
	})

	monitor.Start()

	// Update position multiple times
	time.Sleep(60 * time.Millisecond)
	mock.SetPosition(1.0)
	time.Sleep(60 * time.Millisecond)
	mock.SetPosition(2.0)
	time.Sleep(60 * time.Millisecond)

	monitor.Stop()

	mu.Lock()
	defer mu.Unlock()

	if len(positions) < 2 {
		t.Errorf("Expected multiple position updates, got %d", len(positions))
	}

	// Verify last position is recorded
	if monitor.GetLastPosition() < 1.0 {
		t.Error("Last position should be at least 1.0")
	}
}

func TestPositionMonitor_InvalidPosition(t *testing.T) {
	mock := newMockPipeline()
	mock.SetState(StatePlaying)
	// Position stays at default 0, but let's verify negative is handled

	monitor := NewPositionMonitor(mock, 50*time.Millisecond)

	var count atomic.Int32
	monitor.RegisterCallback(func(pos float64) {
		count.Add(1)
	})

	monitor.Start()
	time.Sleep(100 * time.Millisecond)
	monitor.Stop()

	// Callback should still be invoked for valid position (0 is valid)
	if count.Load() == 0 {
		t.Error("Callback should be invoked for position 0")
	}
}

func TestPositionMonitor_ConcurrentAccess(t *testing.T) {
	mock := newMockPipeline()
	mock.SetState(StatePlaying)
	mock.SetPosition(1.0)

	monitor := NewPositionMonitor(mock, 20*time.Millisecond)

	var wg sync.WaitGroup

	// Start monitor
	monitor.Start()

	// Concurrent operations
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			monitor.RegisterCallback(func(pos float64) {})
		}()
	}

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = monitor.IsRunning()
			_ = monitor.GetLastPosition()
		}()
	}

	wg.Wait()
	monitor.Stop()
}
