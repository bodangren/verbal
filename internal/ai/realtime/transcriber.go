package realtime

import (
	"sync"
)

type TranscriberState int

const (
	StateReady TranscriberState = iota
	StateStreaming
	StateStopped
	StateError
)

type WordData struct {
	Text      string
	StartTime float64
	EndTime   float64
	Confidence float64
}

type Transcriber interface {
	Start() error
	Stop() error
	OnWord(callback func(WordData))
	State() TranscriberState
}

type RealtimeTranscriber struct {
	mu         sync.RWMutex
	state      TranscriberState
	callbacks  []func(WordData)
	onWordLock sync.Mutex
}

func NewRealtimeTranscriber() *RealtimeTranscriber {
	return &RealtimeTranscriber{
		state: StateReady,
	}
}

func (rt *RealtimeTranscriber) Start() error {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	if rt.state != StateReady {
		return nil
	}

	rt.state = StateStreaming
	return nil
}

func (rt *RealtimeTranscriber) Stop() error {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	if rt.state != StateStreaming {
		return nil
	}

	rt.state = StateStopped
	return nil
}

func (rt *RealtimeTranscriber) OnWord(callback func(WordData)) {
	rt.onWordLock.Lock()
	defer rt.onWordLock.Unlock()

	rt.callbacks = append(rt.callbacks, callback)
}

func (rt *RealtimeTranscriber) State() TranscriberState {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	return rt.state
}

func (rt *RealtimeTranscriber) emitWord(word WordData) {
	rt.onWordLock.Lock()
	callbacks := make([]func(WordData), len(rt.callbacks))
	copy(callbacks, rt.callbacks)
	rt.onWordLock.Unlock()

	for _, cb := range callbacks {
		cb(word)
	}
}