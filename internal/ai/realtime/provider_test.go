package realtime

import (
	"context"
	"testing"

	"verbal/internal/ai"
)

type mockStreamingProvider struct {
	name string
	session *mockStreamingSession
}

func (m *mockStreamingProvider) Name() string {
	return m.name
}

func (m *mockStreamingProvider) StartStreaming(ctx context.Context, config StreamingConfig) (StreamingSession, error) {
	m.session = &mockStreamingSession{
		config: config,
		chunks: make([][]byte, 0),
	}
	return m.session, nil
}

type mockStreamingSession struct {
	config StreamingConfig
	chunks [][]byte
}

func (m *mockStreamingSession) SendAudio(chunk []byte) error {
	m.chunks = append(m.chunks, chunk)
	return nil
}

func (m *mockStreamingSession) Close() error {
	return nil
}

func TestStreamingConfig_Defaults(t *testing.T) {
	config := StreamingConfig{}

	if config.SampleRate != 0 {
		t.Errorf("expected SampleRate 0, got %d", config.SampleRate)
	}
	if config.Channels != 0 {
		t.Errorf("expected Channels 0, got %d", config.Channels)
	}
	if config.Format != "" {
		t.Errorf("expected Format '', got %s", config.Format)
	}
}

func TestStreamingProvider_Name(t *testing.T) {
	provider := &mockStreamingProvider{name: "test-provider"}

	if provider.Name() != "test-provider" {
		t.Errorf("expected 'test-provider', got %s", provider.Name())
	}
}

func TestStreamingProvider_StartStreaming(t *testing.T) {
	provider := &mockStreamingProvider{name: "test"}

	config := StreamingConfig{
		SampleRate: 16000,
		Channels:   1,
		Format:    "S16LE",
	}

	session, err := provider.StartStreaming(context.Background(), config)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if session == nil {
		t.Fatal("expected non-nil session")
	}
}

func TestStreamingSession_SendAudio(t *testing.T) {
	session := &mockStreamingSession{
		chunks: make([][]byte, 0),
	}

	chunk := []byte{0x01, 0x02, 0x03}
	err := session.SendAudio(chunk)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(session.chunks) != 1 {
		t.Errorf("expected 1 chunk, got %d", len(session.chunks))
	}
}

func TestStreamingSession_Close(t *testing.T) {
	session := &mockStreamingSession{}

	err := session.Close()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestStreamingConfig_Callbacks(t *testing.T) {
	var partialCalled bool
	var finalCalled bool
	var errorCalled bool

	config := StreamingConfig{
		OnPartialResult: func(words []ai.Word) {
			partialCalled = true
		},
		OnFinalResult: func(words []ai.Word) {
			finalCalled = true
		},
		OnError: func(err error) {
			errorCalled = true
		},
	}

	config.OnPartialResult([]ai.Word{})
	if !partialCalled {
		t.Error("OnPartialResult not called")
	}

	config.OnFinalResult([]ai.Word{})
	if !finalCalled {
		t.Error("OnFinalResult not called")
	}

	config.OnError(nil)
	if !errorCalled {
		t.Error("OnError not called")
	}
}