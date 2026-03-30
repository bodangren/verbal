package transcription

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"verbal/internal/ai"
)

type Service struct {
	provider   ai.Provider
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

func (s *Service) TranscribeFile(ctx context.Context, videoPath string) (*ai.TranscriptionResult, error) {
	// Check if file needs audio extraction (video files)
	audioPath := videoPath
	if isVideoFile(videoPath) {
		if s.onProgress != nil {
			s.onProgress("Extracting audio from video...")
		}

		wavPath, err := extractAudioToWAV(videoPath)
		if err != nil {
			return nil, fmt.Errorf("failed to extract audio: %w", err)
		}
		// Clean up temporary file after transcription
		defer os.Remove(wavPath)
		audioPath = wavPath
	}

	if s.onProgress != nil {
		s.onProgress(fmt.Sprintf("Sending %s to %s...", filepath.Base(videoPath), s.provider.Name()))
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

func isVideoFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".mp4" || ext == ".webm" || ext == ".mkv" || ext == ".avi" || ext == ".mov"
}

func extractAudioToWAV(videoPath string) (string, error) {
	// Create temporary WAV file
	wavPath := videoPath + ".temp.wav"

	// Use FFmpeg to extract and convert audio to 16kHz mono WAV (compatible with both providers)
	cmd := exec.Command("ffmpeg",
		"-i", videoPath,
		"-vn",                  // No video
		"-acodec", "pcm_s16le", // PCM 16-bit little-endian
		"-ar", "16000", // 16kHz sample rate
		"-ac", "1", // Mono
		"-y", // Overwrite output
		wavPath,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		os.Remove(wavPath)
		return "", fmt.Errorf("ffmpeg failed: %w (output: %s)", err, string(output))
	}

	return wavPath, nil
}
