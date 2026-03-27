package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type googleRequest struct {
	Config googleConfig `json:"config"`
	Audio  googleAudio  `json:"audio"`
}

type googleConfig struct {
	Encoding          string `json:"encoding"`
	SampleRate        int    `json:"sampleRateHertz"`
	LanguageCode      string `json:"languageCode"`
	EnableWordOffsets bool   `json:"enableWordTimeOffsets"`
	Model             string `json:"model"`
}

type googleAudio struct {
	Content string `json:"content"`
}

type googleResponse struct {
	Results []googleResult `json:"results"`
}

type googleResult struct {
	Alternatives []googleAlternative `json:"alternatives"`
}

type googleAlternative struct {
	Transcript string       `json:"transcript"`
	Confidence float64      `json:"confidence"`
	Words      []googleWord `json:"words"`
}

type googleWord struct {
	Word      string `json:"word"`
	StartTime string `json:"startTime"`
	EndTime   string `json:"endTime"`
}

type GoogleProvider struct {
	apiKey     string
	baseURL    string
	client     *http.Client
	maxRetries int
}

func NewGoogleProvider(apiKey string) *GoogleProvider {
	return &GoogleProvider{
		apiKey:  apiKey,
		baseURL: "https://speech.googleapis.com",
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		maxRetries: 3,
	}
}

func NewGoogleProviderWithClient(apiKey string, client *http.Client) *GoogleProvider {
	return &GoogleProvider{
		apiKey:     apiKey,
		baseURL:    "https://speech.googleapis.com",
		client:     client,
		maxRetries: 3,
	}
}

func (p *GoogleProvider) Name() string { return "Google" }

func (p *GoogleProvider) Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error) {
	audioData, err := os.ReadFile(audioPath)
	if err != nil {
		return nil, fmt.Errorf("read audio file: %w", err)
	}

	reqBody := googleRequest{
		Config: googleConfig{
			Encoding:          "LINEAR16",
			SampleRate:        16000,
			LanguageCode:      "en-US",
			EnableWordOffsets: true,
			Model:             "latest_long",
		},
		Audio: googleAudio{
			Content: base64.StdEncoding.EncodeToString(audioData),
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/v1/speech:recognize?key=%s", p.baseURL, p.apiKey)

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
		req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(bodyBytes)))
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

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
			classified := ClassifyHTTPError("Google", resp.StatusCode, string(respBody))
			if IsRetryable(classified) && attempt < p.maxRetries {
				lastErr = classified
				continue
			}
			return nil, classified
		}

		var result googleResponse
		if err := json.Unmarshal(respBody, &result); err != nil {
			return nil, fmt.Errorf("parse response: %w", err)
		}

		return convertGoogleResponse(&result), nil
	}

	return nil, fmt.Errorf("max retries exceeded: %w", lastErr)
}

func convertGoogleResponse(resp *googleResponse) *TranscriptionResult {
	var allWords []Word
	var fullText string
	var totalDuration float64

	for _, r := range resp.Results {
		for _, alt := range r.Alternatives {
			if fullText != "" {
				fullText += " "
			}
			fullText += alt.Transcript

			for _, w := range alt.Words {
				word := Word{
					Text:  w.Word,
					Start: parseGoogleDuration(w.StartTime),
					End:   parseGoogleDuration(w.EndTime),
				}
				allWords = append(allWords, word)
				if word.End > totalDuration {
					totalDuration = word.End
				}
			}
		}
	}

	return &TranscriptionResult{
		Text:     fullText,
		Words:    allWords,
		Language: "en",
		Duration: totalDuration,
	}
}

func parseGoogleDuration(s string) float64 {
	s = strings.TrimSuffix(s, "s")
	val, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return val
}
