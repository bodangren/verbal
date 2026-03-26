package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	openaiDefaultEndpoint = "https://api.openai.com/v1"
	openaiDefaultModel    = "whisper-1"
	openaiDefaultTimeout  = 60 * time.Second
)

type OpenAIProvider struct {
	config   ProviderConfig
	client   *http.Client
	endpoint string
}

func NewOpenAIProvider(config ProviderConfig) (*OpenAIProvider, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}

	timeout := openaiDefaultTimeout
	if config.Timeout > 0 {
		timeout = config.Timeout
	}

	endpoint := openaiDefaultEndpoint
	if config.Endpoint != "" {
		endpoint = config.Endpoint
	}

	return &OpenAIProvider{
		config:   config,
		client:   &http.Client{Timeout: timeout},
		endpoint: endpoint,
	}, nil
}

func (p *OpenAIProvider) Name() string {
	return "openai"
}

func (p *OpenAIProvider) IsAvailable() bool {
	return p.config.APIKey != ""
}

func (p *OpenAIProvider) Transcribe(ctx context.Context, audioData []byte, opts TranscriptionOptions) (*TranscriptionResult, error) {
	return p.transcribe(ctx, audioData, "", opts)
}

func (p *OpenAIProvider) TranscribeFile(ctx context.Context, filePath string, opts TranscriptionOptions) (*TranscriptionResult, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read audio file: %w", err)
	}
	return p.transcribe(ctx, data, filepath.Base(filePath), opts)
}

func (p *OpenAIProvider) transcribe(ctx context.Context, audioData []byte, filename string, opts TranscriptionOptions) (*TranscriptionResult, error) {
	url := fmt.Sprintf("%s/audio/transcriptions", p.endpoint)

	body := &bytes.Buffer{}
	writer := newMultipartWriter(body)

	writer.WriteField("model", p.config.Model)
	if p.config.Model == "" {
		writer.WriteField("model", openaiDefaultModel)
	}

	if opts.Language != "" {
		writer.WriteField("language", opts.Language)
	}

	if opts.EnableTimestamps {
		writer.WriteField("timestamp_granularities[]", "word")
		writer.WriteField("response_format", "verbose_json")
	} else {
		writer.WriteField("response_format", "json")
	}

	if filename == "" {
		filename = "audio.mp3"
	}
	if err := writer.WriteFile("file", filename, audioData); err != nil {
		return nil, fmt.Errorf("failed to create multipart request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, &AuthError{Provider: "openai", Message: "invalid API key"}
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		retryAfter := parseRetryAfter(resp.Header.Get("Retry-After"))
		return nil, &RateLimitError{RetryAfter: retryAfter}
	}

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("%w: status %d, body: %s", ErrInvalidResponse, resp.StatusCode, string(bodyBytes))
	}

	return p.parseResponse(resp.Body, opts.EnableTimestamps)
}

type openAITranscriptionResponse struct {
	Text     string  `json:"text"`
	Language string  `json:"language"`
	Duration float64 `json:"duration"`
	Words    []struct {
		Word  string  `json:"word"`
		Start float64 `json:"start"`
		End   float64 `json:"end"`
	} `json:"words"`
}

func (p *OpenAIProvider) parseResponse(r io.Reader, withTimestamps bool) (*TranscriptionResult, error) {
	var resp openAITranscriptionResponse
	if err := json.NewDecoder(r).Decode(&resp); err != nil {
		return nil, fmt.Errorf("%w: failed to decode response: %v", ErrInvalidResponse, err)
	}

	result := &TranscriptionResult{
		Text:     resp.Text,
		Language: resp.Language,
		Duration: resp.Duration,
		Provider: p.Name(),
	}

	for _, w := range resp.Words {
		result.Words = append(result.Words, WordTimestamp{
			Word:  w.Word,
			Start: w.Start,
			End:   w.End,
		})
	}

	return result, nil
}

func parseRetryAfter(header string) time.Duration {
	if header == "" {
		return 30 * time.Second
	}
	var seconds int
	if _, err := fmt.Sscanf(header, "%d", &seconds); err != nil {
		return 30 * time.Second
	}
	return time.Duration(seconds) * time.Second
}

type multipartWriter struct {
	*bytes.Buffer
	boundary string
}

func newMultipartWriter(buf *bytes.Buffer) *multipartWriter {
	boundary := fmt.Sprintf("----boundary%d", time.Now().UnixNano())
	return &multipartWriter{Buffer: buf, boundary: boundary}
}

func (w *multipartWriter) FormDataContentType() string {
	return fmt.Sprintf("multipart/form-data; boundary=%s", w.boundary)
}

func (w *multipartWriter) WriteField(name, value string) {
	fmt.Fprintf(w.Buffer, "--%s\r\n", w.boundary)
	fmt.Fprintf(w.Buffer, "Content-Disposition: form-data; name=\"%s\"\r\n\r\n", name)
	fmt.Fprintf(w.Buffer, "%s\r\n", value)
}

func (w *multipartWriter) WriteFile(name, filename string, data []byte) error {
	fmt.Fprintf(w.Buffer, "--%s\r\n", w.boundary)
	fmt.Fprintf(w.Buffer, "Content-Disposition: form-data; name=\"%s\"; filename=\"%s\"\r\n", name, filename)
	fmt.Fprintf(w.Buffer, "Content-Type: application/octet-stream\r\n\r\n")
	if _, err := w.Buffer.Write(data); err != nil {
		return err
	}
	fmt.Fprintf(w.Buffer, "\r\n--%s--\r\n", w.boundary)
	return nil
}
