package waveform

import (
	"fmt"
	"os"
	"time"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

// NewGenerator creates a new waveform generator with the given configuration.
func NewGenerator(config Config) *Generator {
	sampleRate := config.SampleRate
	if sampleRate <= 0 {
		sampleRate = DefaultConfig().SampleRate
	}
	return &Generator{
		sampleRate: sampleRate,
		extractor:  NewGStreamerExtractor(DefaultExtractorConfig()),
	}
}

// NewGeneratorWithExtractor creates a generator with a custom audio extractor.
// Useful for testing with mock extractors.
func NewGeneratorWithExtractor(config Config, extractor AudioExtractor) *Generator {
	sampleRate := config.SampleRate
	if sampleRate <= 0 {
		sampleRate = DefaultConfig().SampleRate
	}
	return &Generator{
		sampleRate: sampleRate,
		extractor:  extractor,
	}
}

// Generate creates waveform data from an audio/video file.
// Returns an error if the file doesn't exist or cannot be processed.
func (g *Generator) Generate(filePath string) (*Data, error) {
	if filePath == "" {
		return nil, fmt.Errorf("file path is empty")
	}

	// Check if file exists
	if _, err := os.Stat(filePath); err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}

	// Get file duration using GStreamer
	duration, err := g.getDuration(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to get duration: %w", err)
	}

	// Extract audio samples using GStreamer
	rawSamples, err := g.extractAudioSamples(filePath, duration)
	if err != nil {
		return nil, fmt.Errorf("failed to extract audio: %w", err)
	}

	// Normalize amplitudes to 0-1 range
	normalized := normalizeAmplitude(rawSamples)

	// Downsample to target sample rate
	targetSamples := int(duration.Seconds() * float64(g.sampleRate))
	if targetSamples < 1 {
		targetSamples = 1
	}
	samples := downsample(normalized, targetSamples)

	// Create Sample structs with timestamps
	data := &Data{
		FilePath:   filePath,
		Duration:   duration,
		SampleRate: g.sampleRate,
		CreatedAt:  time.Now(),
		Samples:    make([]Sample, len(samples)),
	}

	sampleInterval := duration / time.Duration(len(samples))
	for i, amp := range samples {
		data.Samples[i] = Sample{
			Time:      time.Duration(i) * sampleInterval,
			Amplitude: amp,
		}
	}

	return data, nil
}

// GenerateAsync generates waveform data asynchronously.
// The progress callback is called periodically with a value from 0.0 to 1.0.
// The complete callback is called once when generation is complete.
func (g *Generator) GenerateAsync(
	filePath string,
	onProgress func(float64),
	onComplete func(*Data, error),
) error {
	go func() {
		// Report initial progress
		if onProgress != nil {
			onProgress(0.0)
		}

		// Generate waveform
		data, err := g.Generate(filePath)

		// Report completion
		if onProgress != nil {
			onProgress(1.0)
		}
		if onComplete != nil {
			onComplete(data, err)
		}
	}()

	return nil
}

// getDuration returns the duration of an audio/video file using GStreamer.
func (g *Generator) getDuration(filePath string) (time.Duration, error) {
	// Create a discoverer pipeline to get duration without full playback
	pipelineStr := fmt.Sprintf(
		"filesrc location=%s ! decodebin ! fakesink",
		filePath,
	)

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return 0, fmt.Errorf("failed to parse pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return 0, fmt.Errorf("element is not a pipeline")
	}

	// Set to PAUSED to get duration
	ret := pipeline.SetState(gst.StatePaused)
	if ret == gst.StateChangeFailure {
		return 0, fmt.Errorf("failed to set pipeline state")
	}
	defer pipeline.SetState(gst.StateNull)

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		duration, success := pipeline.QueryDuration(gst.FormatTime)
		if success && duration > 0 {
			return time.Duration(duration), nil
		}
		time.Sleep(50 * time.Millisecond)
	}

	return 0, fmt.Errorf("could not query duration")
}

// extractAudioSamples extracts raw audio amplitude samples from a file.
// Uses the configured AudioExtractor to extract real audio data.
func (g *Generator) extractAudioSamples(filePath string, duration time.Duration) ([]float64, error) {
	if g.extractor == nil {
		return nil, fmt.Errorf("no audio extractor configured")
	}

	// Extract real audio samples using the extractor
	samples, err := g.extractor.Extract(filePath)
	if err != nil {
		return nil, fmt.Errorf("extraction failed: %w", err)
	}

	return samples, nil
}

// normalizeAmplitude normalizes audio samples to a 0.0-1.0 range.
// Input samples can be any range (typically -1.0 to 1.0 for audio).
func normalizeAmplitude(samples []float64) []float64 {
	if len(samples) == 0 {
		return []float64{}
	}

	// Find the maximum absolute value
	maxAbs := 0.0
	for _, s := range samples {
		abs := s
		if abs < 0 {
			abs = -abs
		}
		if abs > maxAbs {
			maxAbs = abs
		}
	}

	// If all samples are zero, return as-is
	if maxAbs == 0 {
		result := make([]float64, len(samples))
		copy(result, samples)
		return result
	}

	// Normalize to 0-1 range (treat all values as absolute amplitude)
	result := make([]float64, len(samples))
	for i, s := range samples {
		abs := s
		if abs < 0 {
			abs = -abs
		}
		result[i] = abs / maxAbs
	}

	return result
}

// downsample reduces the number of samples using averaging.
// Returns at most targetCount samples.
func downsample(samples []float64, targetCount int) []float64 {
	if len(samples) <= targetCount {
		result := make([]float64, len(samples))
		copy(result, samples)
		return result
	}

	if targetCount <= 0 {
		return []float64{}
	}

	result := make([]float64, targetCount)
	windowSize := float64(len(samples)) / float64(targetCount)

	for i := 0; i < targetCount; i++ {
		start := int(float64(i) * windowSize)
		end := int(float64(i+1) * windowSize)
		if end > len(samples) {
			end = len(samples)
		}

		// Average the samples in this window
		sum := 0.0
		count := 0
		for j := start; j < end; j++ {
			sum += samples[j]
			count++
		}
		if count > 0 {
			result[i] = sum / float64(count)
		} else {
			result[i] = 0
		}
	}

	return result
}

func init() {
	gst.Init()
}
