package transcription

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"verbal/internal/ai"
)

var (
	ErrFileNotFound = errors.New("audio file not found")
	ErrCancelled    = errors.New("transcription cancelled")
)

type ProgressCallback func(status string)

type Service struct {
	provider   ai.TranscriptionProvider
	progressCb ProgressCallback
	maxRetries int
	retryDelay time.Duration
}

type ServiceOption func(*Service)

func WithMaxRetries(n int) ServiceOption {
	return func(s *Service) {
		s.maxRetries = n
	}
}

func WithRetryDelay(d time.Duration) ServiceOption {
	return func(s *Service) {
		s.retryDelay = d
	}
}

func NewService(provider ai.TranscriptionProvider, opts ...ServiceOption) *Service {
	s := &Service{
		provider:   provider,
		maxRetries: 3,
		retryDelay: 1 * time.Second,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

func (s *Service) SetProgressCallback(cb ProgressCallback) {
	s.progressCb = cb
}

func (s *Service) ProviderName() string {
	if s.provider == nil {
		return "none"
	}
	return s.provider.Name()
}

func (s *Service) TranscribeFile(ctx context.Context, filePath string) (*ai.TranscriptionResult, error) {
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil, ErrFileNotFound
	}

	s.reportProgress("Validating file...")

	select {
	case <-ctx.Done():
		return nil, ErrCancelled
	default:
	}

	s.reportProgress(fmt.Sprintf("Transcribing with %s...", s.ProviderName()))

	var lastErr error
	for attempt := 0; attempt <= s.maxRetries; attempt++ {
		if attempt > 0 {
			s.reportProgress(fmt.Sprintf("Retrying (%d/%d)...", attempt, s.maxRetries))
			select {
			case <-ctx.Done():
				return nil, ErrCancelled
			case <-time.After(s.retryDelay):
			}
		}

		result, err := s.provider.TranscribeFile(ctx, filePath, ai.TranscriptionOptions{
			EnableTimestamps: true,
		})
		if err == nil {
			s.reportProgress("Transcription complete")
			return result, nil
		}

		var rateLimitErr *ai.RateLimitError
		if errors.As(err, &rateLimitErr) {
			lastErr = err
			s.retryDelay = rateLimitErr.RetryAfter
			continue
		}

		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, ErrCancelled
		}

		return nil, fmt.Errorf("transcription failed: %w", err)
	}

	return nil, fmt.Errorf("transcription failed after %d retries: %w", s.maxRetries, lastErr)
}

func (s *Service) reportProgress(status string) {
	if s.progressCb != nil {
		s.progressCb(status)
	}
}
