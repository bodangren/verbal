package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

type openAIWord struct {
	Word  string  `json:"word"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

type openAIResponse struct {
	Text     string       `json:"text"`
	Language string       `json:"language"`
	Duration float64      `json:"duration"`
	Words    []openAIWord `json:"words"`
}

const maxOpenAIAudioUploadBytes int64 = 25 * 1024 * 1024

type OpenAIProvider struct {
	apiKey     string
	baseURL    string
	client     *http.Client
	maxRetries int
}

func NewOpenAIProvider(apiKey string) *OpenAIProvider {
	return &OpenAIProvider{
		apiKey:  apiKey,
		baseURL: "https://api.openai.com",
		client: &http.Client{
			Timeout: defaultProviderHTTPTimeout,
		},
		maxRetries: 3,
	}
}

func NewOpenAIProviderWithClient(apiKey string, client *http.Client) *OpenAIProvider {
	return &OpenAIProvider{
		apiKey:     apiKey,
		baseURL:    "https://api.openai.com",
		client:     client,
		maxRetries: 3,
	}
}

func (p *OpenAIProvider) Name() string { return "OpenAI" }

func (p *OpenAIProvider) Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error) {
	info, err := os.Stat(audioPath)
	if err != nil {
		return nil, fmt.Errorf("stat audio file: %w", err)
	}
	if info.Size() > maxOpenAIAudioUploadBytes {
		return nil, fmt.Errorf("audio file is %.1f MB, exceeds OpenAI Audio API 25 MB limit; use a shorter recording or compressed audio", float64(info.Size())/(1024*1024))
	}

	file, err := os.Open(audioPath)
	if err != nil {
		return nil, fmt.Errorf("open audio file: %w", err)
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filepath.Base(audioPath))
	if err != nil {
		return nil, fmt.Errorf("create form file: %w", err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, fmt.Errorf("copy audio data: %w", err)
	}

	writer.WriteField("model", "whisper-1")
	writer.WriteField("response_format", "verbose_json")
	writer.WriteField("timestamp_granularities[]", "word")

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("close multipart writer: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt <= p.maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoffDuration(attempt)):
			}
		}

		lastErr = nil
		req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/v1/audio/transcriptions", bytes.NewReader(body.Bytes()))
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+p.apiKey)
		req.Header.Set("Content-Type", writer.FormDataContentType())

		resp, err := p.client.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			lastErr = fmt.Errorf("send request: %w", err)
			continue
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("read response: %w", err)
			continue
		}

		if resp.StatusCode >= 400 {
			classified := ClassifyHTTPErrorWithRequestID("OpenAI", resp.StatusCode, string(respBody), resp.Header.Get("x-request-id"))
			if IsRetryable(classified) {
				lastErr = classified
				if attempt < p.maxRetries {
					continue
				}
				return nil, fmt.Errorf("OpenAI request failed after %d attempt(s): %w", p.maxRetries+1, lastErr)
			}
			return nil, classified
		}

		var result openAIResponse
		if err := json.Unmarshal(respBody, &result); err != nil {
			return nil, fmt.Errorf("parse response: %w", err)
		}

		return &TranscriptionResult{
			Text:     result.Text,
			Language: result.Language,
			Duration: result.Duration,
			Words:    convertOpenAIWords(result.Words),
		}, nil
	}

	return nil, fmt.Errorf("OpenAI request failed after %d attempt(s): %w", p.maxRetries+1, lastErr)
}

func convertOpenAIWords(words []openAIWord) []Word {
	result := make([]Word, len(words))
	for i, w := range words {
		result[i] = Word{Text: w.Word, Start: w.Start, End: w.End}
	}
	return result
}

func backoffDuration(attempt int) time.Duration {
	base := 500 * time.Millisecond
	d := base * time.Duration(1<<uint(attempt))
	// Add ±25% jitter to prevent thundering herd
	jitter := time.Duration(rand.Int63n(int64(d)/2)) - d/4
	return d + jitter
}
