package waveform

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// mockExtractor is a test mock for the AudioExtractor interface
type mockExtractor struct {
	samples []float64
	err     error
}

func (m *mockExtractor) Extract(filePath string) ([]float64, error) {
	return m.samples, m.err
}

func TestGStreamerExtractor_Extract_EmptyPath(t *testing.T) {
	extractor := NewGStreamerExtractor(DefaultExtractorConfig())

	_, err := extractor.Extract("")
	if err == nil {
		t.Error("expected error for empty path, got nil")
	}
}

func TestGStreamerExtractor_Extract_NonExistentFile(t *testing.T) {
	extractor := NewGStreamerExtractor(DefaultExtractorConfig())

	_, err := extractor.Extract("/nonexistent/path/file.mp4")
	if err == nil {
		t.Error("expected error for non-existent file, got nil")
	}
}

func TestGStreamerExtractor_ConvertSamples(t *testing.T) {
	extractor := NewGStreamerExtractor(DefaultExtractorConfig())

	tests := []struct {
		name     string
		input    []byte
		expected []float64
	}{
		{
			name:     "empty data",
			input:    []byte{},
			expected: nil,
		},
		{
			name:     "single byte",
			input:    []byte{0x00},
			expected: nil,
		},
		{
			name:     "zero sample",
			input:    []byte{0x00, 0x00},
			expected: []float64{0.0},
		},
		{
			name:     "maximum positive value",
			input:    []byte{0xFF, 0x7F}, // 32767 in little-endian
			expected: []float64{32767.0 / 32768.0},
		},
		{
			name:     "maximum negative value",
			input:    []byte{0x00, 0x80},           // -32768 in little-endian
			expected: []float64{32768.0 / 32768.0}, // Absolute value normalized
		},
		{
			name:     "multiple samples",
			input:    []byte{0x00, 0x00, 0xFF, 0x7F, 0x00, 0x80},
			expected: []float64{0.0, 32767.0 / 32768.0, 32768.0 / 32768.0},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractor.convertSamples(tt.input)

			if tt.expected == nil {
				if result != nil {
					t.Errorf("expected nil, got %v", result)
				}
				return
			}

			if len(result) != len(tt.expected) {
				t.Errorf("expected %d samples, got %d", len(tt.expected), len(result))
				return
			}

			for i, expected := range tt.expected {
				if result[i] != expected {
					t.Errorf("sample %d: expected %f, got %f", i, expected, result[i])
				}
			}
		})
	}
}

func TestGStreamerExtractor_ReadRawAudioFile(t *testing.T) {
	extractor := NewGStreamerExtractor(DefaultExtractorConfig())

	// Create temporary test file
	tempDir := t.TempDir()
	tempFile := filepath.Join(tempDir, "test.raw")

	// Test reading empty file
	t.Run("empty file", func(t *testing.T) {
		if err := os.WriteFile(tempFile, []byte{}, 0644); err != nil {
			t.Fatalf("failed to create test file: %v", err)
		}

		samples, err := extractor.readRawAudioFile(tempFile)
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
		if len(samples) != 0 {
			t.Errorf("expected empty samples, got %d", len(samples))
		}
	})

	// Test reading file with samples
	t.Run("file with samples", func(t *testing.T) {
		// Create raw audio data: 3 samples
		data := []byte{
			0x00, 0x00, // 0
			0xFF, 0x7F, // 32767
			0x00, 0x80, // -32768
		}
		if err := os.WriteFile(tempFile, data, 0644); err != nil {
			t.Fatalf("failed to create test file: %v", err)
		}

		samples, err := extractor.readRawAudioFile(tempFile)
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
		if len(samples) != 3 {
			t.Errorf("expected 3 samples, got %d", len(samples))
		}
	})
}

func TestGStreamerExtractor_Configuration(t *testing.T) {
	t.Run("default config", func(t *testing.T) {
		config := DefaultExtractorConfig()
		if config.TargetSampleRate != 16000 {
			t.Errorf("expected default sample rate 16000, got %d", config.TargetSampleRate)
		}
		if config.Timeout != 5*time.Minute {
			t.Errorf("expected default timeout 5m, got %v", config.Timeout)
		}
	})

	t.Run("custom config", func(t *testing.T) {
		config := ExtractorConfig{
			TargetSampleRate: 44100,
			Timeout:          30 * time.Second,
		}
		extractor := NewGStreamerExtractor(config)

		if extractor.config.TargetSampleRate != 44100 {
			t.Errorf("expected sample rate 44100, got %d", extractor.config.TargetSampleRate)
		}
		if extractor.config.Timeout != 30*time.Second {
			t.Errorf("expected timeout 30s, got %v", extractor.config.Timeout)
		}
	})
}

func TestAudioExtractorInterface(t *testing.T) {
	// Test that GStreamerExtractor implements AudioExtractor interface
	var _ AudioExtractor = (*GStreamerExtractor)(nil)

	// Test with mock implementation
	mock := &mockExtractor{
		samples: []float64{0.1, 0.2, 0.3},
		err:     nil,
	}

	samples, err := mock.Extract("test.mp4")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if len(samples) != 3 {
		t.Errorf("expected 3 samples, got %d", len(samples))
	}
}
