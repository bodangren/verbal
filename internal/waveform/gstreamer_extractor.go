package waveform

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// GStreamerExtractor extracts audio samples using GStreamer pipelines.
// Uses a temporary file approach since appsink isn't available in gotk4-gstreamer.
type GStreamerExtractor struct {
	config ExtractorConfig
}

// NewGStreamerExtractor creates a new GStreamer-based audio extractor.
func NewGStreamerExtractor(config ExtractorConfig) *GStreamerExtractor {
	return &GStreamerExtractor{
		config: config,
	}
}

// Extract extracts raw audio amplitude samples from a media file using GStreamer.
// Returns amplitude values normalized to [0.0, 1.0] range.
func (e *GStreamerExtractor) Extract(filePath string) ([]float64, error) {
	if filePath == "" {
		return nil, fmt.Errorf("file path is empty")
	}

	// Check if file exists
	if _, err := os.Stat(filePath); err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}

	// Create temporary file for raw audio output
	tempDir := os.TempDir()
	tempFile := filepath.Join(tempDir, fmt.Sprintf("waveform_extract_%d.raw", time.Now().UnixNano()))
	defer os.Remove(tempFile) // Clean up after extraction

	// Build and execute GStreamer pipeline using gst-launch-1.0
	// This extracts audio as raw 16-bit signed integers
	err := e.runExtractionPipeline(filePath, tempFile)
	if err != nil {
		return nil, fmt.Errorf("extraction pipeline failed: %w", err)
	}

	// Read and convert the raw audio data
	samples, err := e.readRawAudioFile(tempFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read extracted audio: %w", err)
	}

	if len(samples) == 0 {
		// No audio samples - file may have no audio track
		return []float64{}, nil
	}

	return samples, nil
}

// runExtractionPipeline executes a GStreamer pipeline to extract raw audio.
func (e *GStreamerExtractor) runExtractionPipeline(inputPath, outputPath string) error {
	// Build gst-launch-1.0 command
	// Pipeline: filesrc -> decodebin -> audioconvert -> audioresample -> raw audio output
	pipeline := fmt.Sprintf(
		"filesrc location=%s ! decodebin ! audioconvert ! audioresample ! "+
			"audio/x-raw,format=S16LE,channels=1,rate=%d ! filesink location=%s",
		inputPath,
		e.config.TargetSampleRate,
		outputPath,
	)

	cmd := exec.Command("gst-launch-1.0", pipeline)

	// Set timeout for the command
	done := make(chan error, 1)
	go func() {
		done <- cmd.Run()
	}()

	select {
	case err := <-done:
		if err != nil {
			// gst-launch returns non-zero on EOS sometimes, which is OK
			// Check if output file was created
			if _, statErr := os.Stat(outputPath); statErr != nil {
				return fmt.Errorf("gst-launch failed and no output created: %w", err)
			}
		}
		return nil
	case <-time.After(e.config.Timeout):
		cmd.Process.Kill()
		return fmt.Errorf("extraction timeout exceeded")
	}
}

// readRawAudioFile reads raw 16-bit PCM data and converts to normalized float64 samples.
func (e *GStreamerExtractor) readRawAudioFile(filePath string) ([]float64, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	if len(data) == 0 {
		return []float64{}, nil
	}

	// Convert bytes to samples (16-bit signed integers, little-endian)
	return e.convertSamples(data), nil
}

// convertSamples converts raw S16LE audio bytes to normalized float64 amplitudes.
func (e *GStreamerExtractor) convertSamples(data []byte) []float64 {
	if len(data) < 2 {
		return nil
	}

	// Each sample is 2 bytes (16-bit signed integer)
	numSamples := len(data) / 2
	samples := make([]float64, numSamples)

	for i := 0; i < numSamples; i++ {
		offset := i * 2
		if offset+1 >= len(data) {
			break
		}

		// Little-endian: low byte first, then high byte
		value := int16(data[offset]) | int16(data[offset+1])<<8

		// Convert to float64 amplitude in range [0.0, 1.0]
		// Take absolute value since waveform visualization shows amplitude
		normalized := float64(value)
		if normalized < 0 {
			normalized = -normalized
		}
		// Normalize by max int16 value (32768)
		samples[i] = normalized / 32768.0
	}

	return samples
}
