package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
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
			Timeout: 30 * time.Second,
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
	file, err := os.Open(audioPath)
	if err != nil {
		return nil, fmt.Errorf("open audio file: %w", err)
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", audioPath)
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
			classified := ClassifyHTTPError("OpenAI", resp.StatusCode, string(respBody))
			if IsRetryable(classified) && attempt < p.maxRetries {
				lastErr = classified
				continue
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

	return nil, fmt.Errorf("max retries exceeded: %w", lastErr)
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
	return d
}
