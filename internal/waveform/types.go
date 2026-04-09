// Package waveform provides audio waveform generation and visualization support.
package waveform

import (
	"time"
)

// Sample represents a single amplitude sample in the waveform.
type Sample struct {
	Time      time.Duration // Time position in the audio
	Amplitude float64       // Normalized amplitude (0.0 to 1.0)
}

// Data represents the complete waveform data for an audio file.
type Data struct {
	FilePath   string        // Path to the source audio/video file
	Duration   time.Duration // Total duration of the audio
	Samples    []Sample      // Downsampled amplitude samples
	SampleRate int           // Samples per second (e.g., 100 = 1 sample per 10ms)
	CreatedAt  time.Time     // When the waveform was generated
}

// Generator creates waveform data from audio/video files.
type Generator struct {
	sampleRate int            // Target samples per second
	extractor  AudioExtractor // Audio extraction backend
}

// Config configures the waveform generator.
type Config struct {
	SampleRate int // Samples per second (default: 100)
}

// DefaultConfig returns the default configuration.
func DefaultConfig() Config {
	return Config{
		SampleRate: 100, // 1 sample per 10ms
	}
}

// AudioExtractor defines the interface for extracting raw audio amplitude data.
// Implementations use different backends (GStreamer, FFmpeg, etc.) to extract
// audio samples from media files.
type AudioExtractor interface {
	// Extract extracts raw audio amplitude samples from the given file.
	// Returns a slice of amplitude values in the range [0.0, 1.0].
	// The number of samples depends on the file duration and extraction sample rate.
	// Returns an error if the file cannot be processed or contains no audio.
	Extract(filePath string) ([]float64, error)
}

// ExtractorConfig configures the audio extraction process.
type ExtractorConfig struct {
	TargetSampleRate int           // Target sample rate for extraction (default: 16000)
	Timeout          time.Duration // Maximum time to wait for extraction (default: 5m)
}

// DefaultExtractorConfig returns the default extractor configuration.
func DefaultExtractorConfig() ExtractorConfig {
	return ExtractorConfig{
		TargetSampleRate: 16000, // 16kHz is good for speech analysis
		Timeout:          5 * time.Minute,
	}
}
