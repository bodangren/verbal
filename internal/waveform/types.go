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
	sampleRate int // Target samples per second
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
