package transcription

import (
	"context"
	"fmt"
	"verbal/internal/ai"
)

type Service struct {
	provider ai.Provider
	onProgress func(string)
}

func NewService(provider ai.Provider) *Service {
	return &Service{
		provider: provider,
	}
}

func (s *Service) SetProgressCallback(cb func(string)) {
	s.onProgress = cb
}

func (s *Service) TranscribeFile(ctx context.Context, audioPath string) (*ai.TranscriptionResult, error) {
	if s.onProgress != nil {
		s.onProgress(fmt.Sprintf("Sending %s to %s...", audioPath, s.provider.Name()))
	}

	result, err := s.provider.Transcribe(ctx, audioPath)
	if err != nil {
		return nil, fmt.Errorf("transcription failed: %w", err)
	}

	if s.onProgress != nil {
		s.onProgress("Transcription complete")
	}

	return result, nil
}
