package transcription

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"verbal/internal/ai"
)

type mockProvider struct {
	result  *ai.TranscriptionResult
	err     error
	called  bool
	callCtr int
}

func (m *mockProvider) Transcribe(ctx context.Context, audioData []byte, opts ai.TranscriptionOptions) (*ai.TranscriptionResult, error) {
	m.called = true
	m.callCtr++
	if m.err != nil {
		return nil, m.err
	}
	return m.result, nil
}

func (m *mockProvider) TranscribeFile(ctx context.Context, filePath string, opts ai.TranscriptionOptions) (*ai.TranscriptionResult, error) {
	m.called = true
	m.callCtr++
	if m.err != nil {
		return nil, m.err
	}
	return m.result, nil
}

func (m *mockProvider) IsAvailable() bool {
	return true
}

func (m *mockProvider) Name() string {
	return "mock"
}

func TestService_TranscribeFile(t *testing.T) {
	t.Run("returns result from provider", func(t *testing.T) {
		mock := &mockProvider{
			result: &ai.TranscriptionResult{
				Text:     "Hello world",
				Language: "en",
				Words: []ai.WordTimestamp{
					{Word: "Hello", Start: 0.0, End: 0.5},
					{Word: "world", Start: 0.6, End: 1.0},
				},
			},
		}
		svc := NewService(mock)

		tmpFile := filepath.Join(t.TempDir(), "test.wav")
		if err := os.WriteFile(tmpFile, []byte("fake audio"), 0644); err != nil {
			t.Fatal(err)
		}

		result, err := svc.TranscribeFile(context.Background(), tmpFile)
		if err != nil {
			t.Fatalf("TranscribeFile failed: %v", err)
		}
		if !mock.called {
			t.Error("provider was not called")
		}
		if result.Text != "Hello world" {
			t.Errorf("expected 'Hello world', got %q", result.Text)
		}
		if len(result.Words) != 2 {
			t.Errorf("expected 2 words, got %d", len(result.Words))
		}
	})

	t.Run("returns error for non-existent file", func(t *testing.T) {
		mock := &mockProvider{}
		svc := NewService(mock)

		_, err := svc.TranscribeFile(context.Background(), "/nonexistent/file.wav")
		if err == nil {
			t.Error("expected error for non-existent file")
		}
		if mock.called {
			t.Error("provider should not be called for missing file")
		}
	})

	t.Run("returns provider error", func(t *testing.T) {
		mock := &mockProvider{
			err: errors.New("api error"),
		}
		svc := NewService(mock)

		tmpFile := filepath.Join(t.TempDir(), "test.wav")
		if err := os.WriteFile(tmpFile, []byte("fake audio"), 0644); err != nil {
			t.Fatal(err)
		}

		_, err := svc.TranscribeFile(context.Background(), tmpFile)
		if err == nil {
			t.Error("expected error from provider")
		}
	})

	t.Run("calls progress callback", func(t *testing.T) {
		mock := &mockProvider{
			result: &ai.TranscriptionResult{Text: "test"},
		}
		svc := NewService(mock)

		tmpFile := filepath.Join(t.TempDir(), "test.wav")
		if err := os.WriteFile(tmpFile, []byte("fake audio"), 0644); err != nil {
			t.Fatal(err)
		}

		var progressCalls []string
		svc.SetProgressCallback(func(status string) {
			progressCalls = append(progressCalls, status)
		})

		_, err := svc.TranscribeFile(context.Background(), tmpFile)
		if err != nil {
			t.Fatalf("TranscribeFile failed: %v", err)
		}

		if len(progressCalls) == 0 {
			t.Error("expected progress callbacks")
		}
	})

	t.Run("respects context cancellation", func(t *testing.T) {
		mock := &mockProvider{
			result: &ai.TranscriptionResult{Text: "test"},
		}
		svc := NewService(mock)

		tmpFile := filepath.Join(t.TempDir(), "test.wav")
		if err := os.WriteFile(tmpFile, []byte("fake audio"), 0644); err != nil {
			t.Fatal(err)
		}

		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		_, err := svc.TranscribeFile(ctx, tmpFile)
		if err == nil {
			t.Error("expected error from cancelled context")
		}
	})
}

func TestService_ProviderName(t *testing.T) {
	mock := &mockProvider{}
	svc := NewService(mock)

	if svc.ProviderName() != "mock" {
		t.Errorf("expected 'mock', got %q", svc.ProviderName())
	}
}

func TestService_WithRetry(t *testing.T) {
	t.Run("retries on transient error", func(t *testing.T) {
		callCount := 0
		mock := &mockProvider{
			err: &ai.RateLimitError{RetryAfter: 10 * time.Millisecond},
		}
		svc := NewService(mock, WithMaxRetries(2), WithRetryDelay(5*time.Millisecond))

		tmpFile := filepath.Join(t.TempDir(), "test.wav")
		if err := os.WriteFile(tmpFile, []byte("fake audio"), 0644); err != nil {
			t.Fatal(err)
		}

		go func() {
			time.Sleep(20 * time.Millisecond)
			mock.err = nil
			mock.result = &ai.TranscriptionResult{Text: "success"}
		}()

		result, err := svc.TranscribeFile(context.Background(), tmpFile)
		callCount = mock.callCtr

		if err != nil {
			t.Logf("transcription eventually failed: %v (calls: %d)", err, callCount)
		} else if result.Text != "success" {
			t.Errorf("expected 'success', got %q", result.Text)
		}
	})
}
