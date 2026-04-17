package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type failingRoundTripper struct {
	err error
}

func (f failingRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, f.err
}

func TestOpenAITranscribe_Success(t *testing.T) {
	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	if err := os.WriteFile(audioFile, []byte("fake audio data"), 0644); err != nil {
		t.Fatal(err)
	}

	responseBody := openAIResponse{
		Text:     "Hello world this is a test",
		Language: "en",
		Duration: 3.5,
		Words: []openAIWord{
			{Word: "Hello", Start: 0.0, End: 0.5},
			{Word: "world", Start: 0.6, End: 1.0},
			{Word: "this", Start: 1.1, End: 1.3},
			{Word: "is", Start: 1.4, End: 1.5},
			{Word: "a", Start: 1.6, End: 1.7},
			{Word: "test", Start: 1.8, End: 2.2},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/v1/audio/transcriptions" {
			t.Errorf("expected /v1/audio/transcriptions, got %s", r.URL.Path)
		}

		auth := r.Header.Get("Authorization")
		if auth != "Bearer test-api-key" {
			t.Errorf("expected Bearer test-api-key, got %s", auth)
		}

		if err := r.ParseMultipartForm(32 << 20); err != nil {
			t.Fatalf("failed to parse multipart: %v", err)
		}

		if r.FormValue("model") != "whisper-1" {
			t.Errorf("expected model whisper-1, got %s", r.FormValue("model"))
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			t.Fatalf("expected file in form: %v", err)
		}
		defer file.Close()
		if header.Filename != filepath.Base(audioFile) {
			t.Errorf("expected multipart filename %q, got %q", filepath.Base(audioFile), header.Filename)
		}
		fileContent, _ := io.ReadAll(file)
		if len(fileContent) == 0 {
			t.Error("file content should not be empty")
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(responseBody)
	}))
	defer server.Close()

	provider := NewOpenAIProviderWithClient("test-api-key", server.Client())
	provider.baseURL = server.URL

	result, err := provider.Transcribe(context.Background(), audioFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Text != "Hello world this is a test" {
		t.Errorf("text = %q, want %q", result.Text, "Hello world this is a test")
	}
	if result.Language != "en" {
		t.Errorf("language = %q, want %q", result.Language, "en")
	}
	if len(result.Words) != 6 {
		t.Fatalf("words count = %d, want 6", len(result.Words))
	}
	if result.Words[0].Text != "Hello" {
		t.Errorf("first word = %q, want %q", result.Words[0].Text, "Hello")
	}
	if result.Words[0].Start != 0.0 {
		t.Errorf("first word start = %f, want 0.0", result.Words[0].Start)
	}
	if result.Duration != 3.5 {
		t.Errorf("duration = %f, want 3.5", result.Duration)
	}
}

func TestNewOpenAIProvider_UsesLongTranscriptionTimeout(t *testing.T) {
	provider := NewOpenAIProvider("key")
	if provider.client.Timeout != defaultProviderHTTPTimeout {
		t.Fatalf("OpenAI timeout = %v, want %v", provider.client.Timeout, defaultProviderHTTPTimeout)
	}
}

func TestOpenAITranscribe_AuthError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid api key"})
	}))
	defer server.Close()

	provider := NewOpenAIProviderWithClient("bad-key", server.Client())
	provider.baseURL = server.URL
	provider.maxRetries = 0

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	_, err := provider.Transcribe(context.Background(), audioFile)
	if err == nil {
		t.Fatal("expected error for 401")
	}

	var authErr *AuthError
	if !errors.As(err, &authErr) {
		t.Errorf("expected AuthError, got %T: %v", err, err)
	}
}

func TestOpenAITranscribe_RateLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(429)
		json.NewEncoder(w).Encode(map[string]string{"error": "rate limited"})
	}))
	defer server.Close()

	provider := NewOpenAIProviderWithClient("key", server.Client())
	provider.baseURL = server.URL
	provider.maxRetries = 0

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	_, err := provider.Transcribe(context.Background(), audioFile)
	if err == nil {
		t.Fatal("expected error for 429")
	}

	var rateErr *RateLimitError
	if !errors.As(err, &rateErr) {
		t.Errorf("expected RateLimitError, got %T: %v", err, err)
	}
}

func TestOpenAITranscribe_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "internal error"})
	}))
	defer server.Close()

	provider := NewOpenAIProviderWithClient("key", server.Client())
	provider.baseURL = server.URL
	provider.maxRetries = 0

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	_, err := provider.Transcribe(context.Background(), audioFile)
	if err == nil {
		t.Fatal("expected error for 500")
	}

	var serverErr *ServerError
	if !errors.As(err, &serverErr) {
		t.Errorf("expected ServerError, got %T: %v", err, err)
	}
}

func TestOpenAITranscribe_FileNotFound(t *testing.T) {
	provider := NewOpenAIProvider("key")
	_, err := provider.Transcribe(context.Background(), "/nonexistent/file.wav")
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestOpenAITranscribe_RejectsOversizedUpload(t *testing.T) {
	provider := NewOpenAIProviderWithClient("key", &http.Client{
		Transport: failingRoundTripper{err: errors.New("network should not be used")},
	})

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "too-large.wav")
	file, err := os.Create(audioFile)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxOpenAIAudioUploadBytes + 1); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	_, err = provider.Transcribe(context.Background(), audioFile)
	if err == nil {
		t.Fatal("expected oversize error")
	}
	if !strings.Contains(err.Error(), "exceeds OpenAI Audio API 25 MB limit") {
		t.Fatalf("expected OpenAI size limit error, got %q", err.Error())
	}
}

func TestOpenAITranscribe_ContextCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	provider := NewOpenAIProvider("key")

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	_, err := provider.Transcribe(ctx, audioFile)
	if err == nil {
		t.Fatal("expected error for cancelled context")
	}
}

func TestOpenAITranscribe_RetryOn429ThenSuccess(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		if callCount <= 2 {
			w.WriteHeader(429)
			json.NewEncoder(w).Encode(map[string]string{"error": "rate limited"})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(openAIResponse{
			Text:     "retried successfully",
			Language: "en",
			Duration: 1.0,
		})
	}))
	defer server.Close()

	provider := NewOpenAIProviderWithClient("key", server.Client())
	provider.baseURL = server.URL
	provider.maxRetries = 3

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	result, err := provider.Transcribe(context.Background(), audioFile)
	if err != nil {
		t.Fatalf("unexpected error after retry: %v", err)
	}
	if result.Text != "retried successfully" {
		t.Errorf("text = %q, want %q", result.Text, "retried successfully")
	}
	if callCount != 3 {
		t.Errorf("expected 3 calls (2 retries + 1 success), got %d", callCount)
	}
}

func TestOpenAITranscribe_RetryExhausted(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "always fails"})
	}))
	defer server.Close()

	provider := NewOpenAIProviderWithClient("key", server.Client())
	provider.baseURL = server.URL
	provider.maxRetries = 2

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	_, err := provider.Transcribe(context.Background(), audioFile)
	if err == nil {
		t.Fatal("expected error after retries exhausted")
	}

	var serverErr *ServerError
	if !errors.As(err, &serverErr) {
		t.Errorf("expected ServerError, got %T: %v", err, err)
	}
	if !strings.Contains(err.Error(), "OpenAI request failed after 3 attempt") {
		t.Fatalf("expected final retry context, got %q", err.Error())
	}
}

func TestOpenAITranscribe_EmptyServerErrorIncludesRequestID(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("x-request-id", "req_openai_empty_500")
		w.WriteHeader(500)
	}))
	defer server.Close()

	provider := NewOpenAIProviderWithClient("key", server.Client())
	provider.baseURL = server.URL
	provider.maxRetries = 0

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	_, err := provider.Transcribe(context.Background(), audioFile)
	if err == nil {
		t.Fatal("expected error for empty 500")
	}

	msg := err.Error()
	if !strings.Contains(msg, "OpenAI request failed after 1 attempt") {
		t.Fatalf("expected final retry context, got %q", msg)
	}
	if !strings.Contains(msg, "empty response body") {
		t.Fatalf("expected empty body placeholder, got %q", msg)
	}
	if !strings.Contains(msg, "request_id=req_openai_empty_500") {
		t.Fatalf("expected request ID, got %q", msg)
	}
	if callCount != 1 {
		t.Fatalf("callCount = %d, want 1", callCount)
	}

	var serverErr *ServerError
	if !errors.As(err, &serverErr) {
		t.Fatalf("expected wrapped ServerError, got %T: %v", err, err)
	}
	if serverErr.RequestID != "req_openai_empty_500" {
		t.Fatalf("RequestID = %q, want req_openai_empty_500", serverErr.RequestID)
	}
}

func TestOpenAITranscribe_SendFailureIncludesUnderlyingCause(t *testing.T) {
	provider := NewOpenAIProviderWithClient("key", &http.Client{
		Transport: failingRoundTripper{err: errors.New("dial tcp provider blocked")},
	})
	provider.maxRetries = 0

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	_, err := provider.Transcribe(context.Background(), audioFile)
	if err == nil {
		t.Fatal("expected send failure")
	}
	msg := err.Error()
	if !strings.Contains(msg, "OpenAI request failed after 1 attempt") {
		t.Fatalf("expected provider retry context, got %q", msg)
	}
	if !strings.Contains(msg, "dial tcp provider blocked") {
		t.Fatalf("expected underlying network cause, got %q", msg)
	}
}

func TestOpenAITranscribe_NoRetryOnAuthError(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(401)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
	}))
	defer server.Close()

	provider := NewOpenAIProviderWithClient("key", server.Client())
	provider.baseURL = server.URL
	provider.maxRetries = 3

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	_, err := provider.Transcribe(context.Background(), audioFile)
	if err == nil {
		t.Fatal("expected error for 401")
	}
	if callCount != 1 {
		t.Errorf("auth error should not retry, got %d calls", callCount)
	}

	var authErr *AuthError
	if !errors.As(err, &authErr) {
		t.Errorf("expected AuthError, got %T: %v", err, err)
	}
}
