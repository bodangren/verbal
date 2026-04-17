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

type audioExtractionSpec struct {
	extension   string
	encoder     string
	description string
}

// Service provides high-level transcription functionality using an AI provider.
// It handles audio extraction from video files and provides progress callbacks.
type Service struct {
	provider   ai.Provider
	onProgress func(string)
}

// NewService creates a new transcription service with the given AI provider.
func NewService(provider ai.Provider) *Service {
	return &Service{
		provider: provider,
	}
}

// SetProgressCallback sets a callback function that will be called with progress updates
// during the transcription process.
func (s *Service) SetProgressCallback(cb func(string)) {
	s.onProgress = cb
}

// TranscribeFile transcribes the audio from a video or audio file.
// For video files, it automatically extracts audio before transcription.
// The ctx parameter can be used to cancel the operation.
func (s *Service) TranscribeFile(ctx context.Context, videoPath string) (*ai.TranscriptionResult, error) {
	// Check if file needs audio extraction (video files)
	audioPath := videoPath
	if isVideoFile(videoPath) {
		spec := audioExtractionSpecForProvider(s.provider)
		if s.onProgress != nil {
			s.onProgress(fmt.Sprintf("Extracting %s audio from video...", spec.description))
		}

		extractedPath, err := extractAudio(videoPath, spec)
		if err != nil {
			return nil, fmt.Errorf("failed to extract audio: %w", err)
		}
		// Clean up temporary file after transcription
		defer os.Remove(extractedPath)
		audioPath = extractedPath
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

func audioExtractionSpecForProvider(provider ai.Provider) audioExtractionSpec {
	if provider != nil && strings.EqualFold(provider.Name(), "OpenAI") {
		return audioExtractionSpec{
			extension:   ".flac",
			encoder:     "flacenc",
			description: "compressed FLAC",
		}
	}

	return audioExtractionSpec{
		extension:   ".wav",
		encoder:     "wavenc",
		description: "WAV",
	}
}

func extractAudio(videoPath string, spec audioExtractionSpec) (string, error) {
	tempFile, err := os.CreateTemp("", "verbal-transcription-*"+spec.extension)
	if err != nil {
		return "", fmt.Errorf("create temporary audio file: %w", err)
	}
	outputPath := tempFile.Name()
	if err := tempFile.Close(); err != nil {
		os.Remove(outputPath)
		return "", fmt.Errorf("close temporary audio file: %w", err)
	}

	cmd := buildAudioExtractionCommand(videoPath, outputPath, spec)
	output, err := cmd.CombinedOutput()
	if err != nil {
		os.Remove(outputPath)
		return "", fmt.Errorf("gstreamer extraction failed: %w (output: %s)", err, strings.TrimSpace(string(output)))
	}

	info, err := os.Stat(outputPath)
	if err != nil {
		os.Remove(outputPath)
		return "", fmt.Errorf("extracted audio missing: %w", err)
	}
	if info.Size() <= 0 {
		os.Remove(outputPath)
		return "", fmt.Errorf("extracted audio is empty")
	}

	return outputPath, nil
}

func buildAudioExtractionCommand(inputPath, outputPath string, spec audioExtractionSpec) *exec.Cmd {
	return exec.Command(
		"gst-launch-1.0",
		"-q",
		"filesrc", "location="+sanitizeLocationArg(inputPath),
		"!", "decodebin",
		"!", "audioconvert",
		"!", "audioresample",
		"!", "audio/x-raw,format=S16LE,channels=1,rate=16000",
		"!", spec.encoder,
		"!", "filesink", "location="+sanitizeLocationArg(outputPath),
	)
}

func sanitizeLocationArg(path string) string {
	sanitized := strings.ReplaceAll(path, "\n", "")
	return strings.ReplaceAll(sanitized, "\r", "")
}
