package realtime

import (
	"testing"
	"time"
)

func TestRecordingTranscriber_Start_Stop(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{
		Transcriber: nil,
		Provider:    nil,
	})

	rt.mu.Lock()
	rt.transcriber = &mockRealtimeTranscriber{}
	rt.mu.Unlock()

	err := rt.Start()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if !rt.IsActive() {
		t.Error("expected transcriber to be active")
	}

	err = rt.Stop()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if rt.IsActive() {
		t.Error("expected transcriber to be inactive")
	}
}

func TestRecordingTranscriber_Start_AlreadyActive(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{
		Transcriber: nil,
		Provider:    nil,
	})

	rt.mu.Lock()
	rt.transcriber = &mockRealtimeTranscriber{}
	rt.isActive = true
	rt.mu.Unlock()

	err := rt.Start()
	if err == nil {
		t.Error("expected error when starting active transcriber")
	}
}

func TestRecordingTranscriber_Stop_NotActive(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{})

	err := rt.Stop()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRecordingTranscriber_ProcessAudioChunk_NotActive(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{})

	err := rt.ProcessAudioChunk([]byte{0x01, 0x02})
	if err == nil {
		t.Error("expected error when processing chunk on inactive transcriber")
	}
}

func TestRecordingTranscriber_GetWords(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{})

	rt.mu.Lock()
	rt.words = []WordData{
		{Text: "hello", StartTime: 0.0, EndTime: 0.5},
		{Text: "world", StartTime: 0.5, EndTime: 1.0},
	}
	rt.mu.Unlock()

	words := rt.GetWords()
	if len(words) != 2 {
		t.Errorf("expected 2 words, got %d", len(words))
	}
}

func TestRecordingTranscriber_Clear(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{})

	rt.mu.Lock()
	rt.words = []WordData{
		{Text: "hello", StartTime: 0.0, EndTime: 0.5},
	}
	rt.mu.Unlock()

	rt.Clear()

	rt.mu.RLock()
	defer rt.mu.RUnlock()
	if len(rt.words) != 0 {
		t.Errorf("expected 0 words after clear, got %d", len(rt.words))
	}
}

func TestMockRecordingTranscriber_Basic(t *testing.T) {
	mock := NewMockRecordingTranscriber()

	err := mock.Start()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if !mock.IsActive() {
		t.Error("expected active")
	}

	err = mock.Stop()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if mock.IsActive() {
		t.Error("expected inactive")
	}
}

func TestMockRecordingTranscriber_ProcessAudioChunk(t *testing.T) {
	mock := NewMockRecordingTranscriber()

	chunk := []byte{0x01, 0x02, 0x03}
	err := mock.ProcessAudioChunk(chunk)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(mock.Chunks) != 1 {
		t.Errorf("expected 1 chunk, got %d", len(mock.Chunks))
	}
}

func TestMockRecordingTranscriber_SetErrors(t *testing.T) {
	mock := NewMockRecordingTranscriber()

	mock.SetStartError(nil)
	mock.SetStopError(nil)

	err := mock.Start()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	mock.IsActive_ = true
	err = mock.Stop()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRecordingTranscriber_DefaultChunkSize(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{})

	rt.mu.RLock()
	defer rt.mu.RUnlock()
	if rt.chunkSize != 4096 {
		t.Errorf("expected default chunk size 4096, got %d", rt.chunkSize)
	}
}

func TestRecordingTranscriber_CustomChunkSize(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{
		ChunkSize: 8192,
	})

	rt.mu.RLock()
	defer rt.mu.RUnlock()
	if rt.chunkSize != 8192 {
		t.Errorf("expected custom chunk size 8192, got %d", rt.chunkSize)
	}
}

func TestRecordingTranscriber_IsActive(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{
		Transcriber: nil,
		Provider:    nil,
	})

	rt.mu.Lock()
	rt.transcriber = &mockRealtimeTranscriber{}
	rt.mu.Unlock()

	if rt.IsActive() {
		t.Error("expected inactive initially")
	}

	rt.Start()

	if !rt.IsActive() {
		t.Error("expected active after start")
	}

	rt.Stop()

	if rt.IsActive() {
		t.Error("expected inactive after stop")
	}
}

func TestRecordingTranscriber_GetWords_Empty(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{})

	words := rt.GetWords()
	if len(words) != 0 {
		t.Errorf("expected 0 words, got %d", len(words))
	}
}

func TestRecordingTranscriber_Concurrent(t *testing.T) {
	rt := NewRecordingTranscriber(RecordingTranscriberConfig{
		Transcriber: nil,
		Provider:    nil,
	})

	rt.mu.Lock()
	rt.transcriber = &mockRealtimeTranscriber{}
	rt.mu.Unlock()

	done := make(chan bool)

	go func() {
		for i := 0; i < 100; i++ {
			rt.IsActive()
		}
		done <- true
	}()

	go func() {
		for i := 0; i < 100; i++ {
			rt.Start()
			time.Sleep(time.Microsecond)
			rt.Stop()
		}
		done <- true
	}()

	<-done
	<-done
}