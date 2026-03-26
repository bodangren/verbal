package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

const (
	googleDefaultEndpoint = "https://speech.googleapis.com/v1"
	googleDefaultTimeout  = 120 * time.Second
)

type GoogleProvider struct {
	config   ProviderConfig
	client   *http.Client
	endpoint string
}

func NewGoogleProvider(config ProviderConfig) (*GoogleProvider, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}

	timeout := googleDefaultTimeout
	if config.Timeout > 0 {
		timeout = config.Timeout
	}

	endpoint := googleDefaultEndpoint
	if config.Endpoint != "" {
		endpoint = config.Endpoint
	}

	return &GoogleProvider{
		config:   config,
		client:   &http.Client{Timeout: timeout},
		endpoint: endpoint,
	}, nil
}

func (p *GoogleProvider) Name() string {
	return "google"
}

func (p *GoogleProvider) IsAvailable() bool {
	return p.config.APIKey != ""
}

func (p *GoogleProvider) Transcribe(ctx context.Context, audioData []byte, opts TranscriptionOptions) (*TranscriptionResult, error) {
	return p.transcribe(ctx, audioData, opts)
}

func (p *GoogleProvider) TranscribeFile(ctx context.Context, filePath string, opts TranscriptionOptions) (*TranscriptionResult, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read audio file: %w", err)
	}
	return p.transcribe(ctx, data, opts)
}

func (p *GoogleProvider) transcribe(ctx context.Context, audioData []byte, opts TranscriptionOptions) (*TranscriptionResult, error) {
	url := fmt.Sprintf("%s/speech:recognize?key=%s", p.endpoint, p.config.APIKey)

	reqBody := googleRecognizeRequest{
		Config: googleRecognitionConfig{
			Encoding:              "LINEAR16",
			SampleRateHertz:       16000,
			LanguageCode:          "en-US",
			EnableWordTimeOffsets: opts.EnableTimestamps,
		},
		Audio: googleAudio{
			Content: base64.StdEncoding.EncodeToString(audioData),
		},
	}

	if opts.Language != "" {
		reqBody.Config.LanguageCode = opts.Language
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, &AuthError{Provider: "google", Message: "invalid API key"}
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		retryAfter := parseRetryAfter(resp.Header.Get("Retry-After"))
		return nil, &RateLimitError{RetryAfter: retryAfter}
	}

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("%w: status %d, body: %s", ErrInvalidResponse, resp.StatusCode, string(bodyBytes))
	}

	return p.parseResponse(resp.Body)
}

type googleRecognizeRequest struct {
	Config googleRecognitionConfig `json:"config"`
	Audio  googleAudio             `json:"audio"`
}

type googleRecognitionConfig struct {
	Encoding              string `json:"encoding"`
	SampleRateHertz       int    `json:"sampleRateHertz,omitempty"`
	LanguageCode          string `json:"languageCode"`
	EnableWordTimeOffsets bool   `json:"enableWordTimeOffsets"`
}

type googleAudio struct {
	Content string `json:"content,omitempty"`
}

type googleRecognizeResponse struct {
	Results []struct {
		Alternatives []struct {
			Transcript string  `json:"transcript"`
			Confidence float64 `json:"confidence"`
			Words      []struct {
				Word       string  `json:"word"`
				StartTime  string  `json:"startTime"`
				EndTime    string  `json:"endTime"`
				Confidence float64 `json:"confidence,omitempty"`
			} `json:"words"`
		} `json:"alternatives"`
	} `json:"results"`
}

func (p *GoogleProvider) parseResponse(r io.Reader) (*TranscriptionResult, error) {
	var resp googleRecognizeResponse
	if err := json.NewDecoder(r).Decode(&resp); err != nil {
		return nil, fmt.Errorf("%w: failed to decode response: %v", ErrInvalidResponse, err)
	}

	result := &TranscriptionResult{
		Provider: p.Name(),
	}

	var totalDuration float64

	for _, res := range resp.Results {
		for _, alt := range res.Alternatives {
			if result.Text != "" {
				result.Text += " "
			}
			result.Text += alt.Transcript

			for _, w := range alt.Words {
				start := parseGoogleDuration(w.StartTime)
				end := parseGoogleDuration(w.EndTime)
				if end > totalDuration {
					totalDuration = end
				}
				result.Words = append(result.Words, WordTimestamp{
					Word:       w.Word,
					Start:      start,
					End:        end,
					Confidence: w.Confidence,
				})
			}
		}
	}

	result.Duration = totalDuration
	return result, nil
}

func parseGoogleDuration(s string) float64 {
	if s == "" {
		return 0
	}
	var seconds float64
	if _, err := fmt.Sscanf(s, "%fs", &seconds); err != nil {
		return 0
	}
	return seconds
}
