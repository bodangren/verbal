package realtime

import (
	"fmt"
	"sync"
)

type RecordingTranscriber struct {
	mu         sync.RWMutex
	transcriber Transcriber
	provider    StreamingProvider
	config      StreamingConfig
	session     StreamingSession
	words       []WordData
	isActive    bool
	chunkSize   int
	lastChunk   []byte
}

type RecordingTranscriberConfig struct {
	Transcriber Transcriber
	Provider    StreamingProvider
	ChunkSize   int
}

func NewRecordingTranscriber(config RecordingTranscriberConfig) *RecordingTranscriber {
	if config.ChunkSize == 0 {
		config.ChunkSize = 4096
	}

	return &RecordingTranscriber{
		transcriber: config.Transcriber,
		provider:    config.Provider,
		chunkSize:   config.ChunkSize,
		words:       make([]WordData, 0),
		isActive:    false,
	}
}

func (rt *RecordingTranscriber) Start() error {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	if rt.isActive {
		return fmt.Errorf("transcriber already active")
	}

	if rt.transcriber == nil {
		return fmt.Errorf("no transcriber configured")
	}

	if err := rt.transcriber.Start(); err != nil {
		return fmt.Errorf("failed to start transcriber: %w", err)
	}

	if rt.provider != nil {
		session, err := rt.provider.StartStreaming(nil, rt.config)
		if err != nil {
			rt.transcriber.Stop()
			return fmt.Errorf("failed to start streaming: %w", err)
		}
		rt.session = session
	}

	rt.isActive = true
	return nil
}

func (rt *RecordingTranscriber) Stop() error {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	if !rt.isActive {
		return nil
	}

	if rt.session != nil {
		rt.session.Close()
		rt.session = nil
	}

	if rt.transcriber != nil {
		rt.transcriber.Stop()
	}

	rt.isActive = false
	return nil
}

func (rt *RecordingTranscriber) ProcessAudioChunk(chunk []byte) error {
	rt.mu.RLock()
	if !rt.isActive {
		rt.mu.RUnlock()
		return fmt.Errorf("transcriber not active")
	}
	rt.mu.RUnlock()

	if rt.session != nil {
		if err := rt.session.SendAudio(chunk); err != nil {
			return fmt.Errorf("failed to send audio: %w", err)
		}
	}

	return nil
}

func (rt *RecordingTranscriber) GetWords() []WordData {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	result := make([]WordData, len(rt.words))
	copy(result, rt.words)
	return result
}

func (rt *RecordingTranscriber) IsActive() bool {
	rt.mu.RLock()
	defer rt.mu.RUnlock()
	return rt.isActive
}

func (rt *RecordingTranscriber) Clear() {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	rt.words = make([]WordData, 0)
}

type MockRecordingTranscriber struct {
	IsActive_   bool
	StartError  error
	StopError   error
	Chunks      [][]byte
	Words       []WordData
	mu          sync.Mutex
}

func NewMockRecordingTranscriber() *MockRecordingTranscriber {
	return &MockRecordingTranscriber{
		IsActive_: false,
		Chunks:   make([][]byte, 0),
		Words:    make([]WordData, 0),
	}
}

func (m *MockRecordingTranscriber) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.IsActive_ = true
	return m.StartError
}

func (m *MockRecordingTranscriber) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.IsActive_ = false
	return m.StopError
}

func (m *MockRecordingTranscriber) ProcessAudioChunk(chunk []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Chunks = append(m.Chunks, chunk)
	return nil
}

func (m *MockRecordingTranscriber) GetWords() []WordData {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]WordData, len(m.Words))
	copy(result, m.Words)
	return result
}

func (m *MockRecordingTranscriber) IsActive() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.IsActive_
}

func (m *MockRecordingTranscriber) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Words = make([]WordData, 0)
}

func (m *MockRecordingTranscriber) SetStartError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.StartError = err
}

func (m *MockRecordingTranscriber) SetStopError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.StopError = err
}

type mockRealtimeTranscriber struct {
	started bool
}

func (m *mockRealtimeTranscriber) Start() error {
	m.started = true
	return nil
}

func (m *mockRealtimeTranscriber) Stop() error {
	m.started = false
	return nil
}

func (m *mockRealtimeTranscriber) OnWord(callback func(WordData)) {
}

func (m *mockRealtimeTranscriber) State() TranscriberState {
	if m.started {
		return StateStreaming
	}
	return StateReady
}

func (m *mockRealtimeTranscriber) emitWord(word WordData) {
}