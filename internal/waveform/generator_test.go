package waveform

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// hasDisplay returns true if a display is available for GTK/GStreamer tests.
func hasDisplay() bool {
	return os.Getenv("DISPLAY") != "" || os.Getenv("WAYLAND_DISPLAY") != ""
}

func TestNewGenerator(t *testing.T) {
	tests := []struct {
		name     string
		config   Config
		wantRate int
	}{
		{
			name:     "default config",
			config:   DefaultConfig(),
			wantRate: 100,
		},
		{
			name: "custom sample rate",
			config: Config{
				SampleRate: 200,
			},
			wantRate: 200,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gen := NewGenerator(tt.config)
			if gen == nil {
				t.Fatal("NewGenerator returned nil")
			}
			if gen.sampleRate != tt.wantRate {
				t.Errorf("sampleRate = %d, want %d", gen.sampleRate, tt.wantRate)
			}
		})
	}
}

func TestGenerator_Generate(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available, skipping GStreamer test")
	}

	// Create a test audio file
	tempDir := t.TempDir()
	testFile := filepath.Join(tempDir, "test.wav")

	// Create a simple test audio file (1 second of silence)
	wavData := createTestWAV(t, 1*time.Second)
	if err := os.WriteFile(testFile, wavData, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	gen := NewGenerator(DefaultConfig())

	tests := []struct {
		name        string
		filePath    string
		wantErr     bool
		errContains string
	}{
		{
			name:     "valid audio file",
			filePath: testFile,
			wantErr:  false,
		},
		{
			name:        "non-existent file",
			filePath:    filepath.Join(tempDir, "nonexistent.wav"),
			wantErr:     true,
			errContains: "no such file",
		},
		{
			name:        "empty file path",
			filePath:    "",
			wantErr:     true,
			errContains: "file path",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := gen.Generate(tt.filePath)

			if tt.wantErr {
				if err == nil {
					t.Errorf("Generate() expected error but got nil")
					return
				}
				if tt.errContains != "" && !contains(err.Error(), tt.errContains) {
					t.Errorf("Generate() error = %v, should contain %v", err, tt.errContains)
				}
				return
			}

			if err != nil {
				t.Fatalf("Generate() unexpected error: %v", err)
			}
			if data == nil {
				t.Fatal("Generate() returned nil data")
			}
			if data.FilePath != tt.filePath {
				t.Errorf("FilePath = %s, want %s", data.FilePath, tt.filePath)
			}
			if len(data.Samples) == 0 {
				t.Error("Samples is empty")
			}
			if data.SampleRate != 100 {
				t.Errorf("SampleRate = %d, want 100", data.SampleRate)
			}

			// Verify all amplitudes are normalized between 0 and 1
			for i, sample := range data.Samples {
				if sample.Amplitude < 0.0 {
					t.Errorf("sample %d amplitude %f below 0", i, sample.Amplitude)
				}
				if sample.Amplitude > 1.0 {
					t.Errorf("sample %d amplitude %f above 1", i, sample.Amplitude)
				}
			}
		})
	}
}

func TestGenerator_GenerateAsync(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available, skipping GStreamer test")
	}

	tempDir := t.TempDir()
	testFile := filepath.Join(tempDir, "test.wav")
	wavData := createTestWAV(t, 500*time.Millisecond)
	if err := os.WriteFile(testFile, wavData, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	gen := NewGenerator(DefaultConfig())

	t.Run("async generation", func(t *testing.T) {
		progressCalled := false
		completeCalled := false
		var resultData *Data
		var resultErr error
		done := make(chan bool)

		err := gen.GenerateAsync(testFile,
			func(progress float64) {
				progressCalled = true
				if progress < 0.0 || progress > 1.0 {
					t.Errorf("progress %f out of range [0, 1]", progress)
				}
			},
			func(data *Data, err error) {
				completeCalled = true
				resultData = data
				resultErr = err
				done <- true
			},
		)

		if err != nil {
			t.Fatalf("GenerateAsync() error: %v", err)
		}

		// Wait for completion
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Fatal("timeout waiting for async generation")
		}

		if !completeCalled {
			t.Error("completion callback was not called")
		}
		if resultErr != nil {
			t.Errorf("unexpected error: %v", resultErr)
		}
		if resultData == nil {
			t.Error("resultData is nil")
		}
		if !progressCalled {
			t.Log("progress callback was not called (may be too fast)")
		}
	})

	t.Run("invalid file async", func(t *testing.T) {
		completeCalled := false
		var resultErr error
		done := make(chan bool)

		err := gen.GenerateAsync("/nonexistent/file.wav",
			func(progress float64) {},
			func(data *Data, err error) {
				completeCalled = true
				resultErr = err
				done <- true
			},
		)

		if err != nil {
			t.Fatalf("GenerateAsync() error: %v", err)
		}

		// Wait for completion
		select {
		case <-done:
		case <-time.After(1 * time.Second):
			t.Fatal("timeout waiting for async generation")
		}

		if !completeCalled {
			t.Error("completion callback was not called")
		}
		if resultErr == nil {
			t.Error("expected error for invalid file")
		}
	})
}

func TestNormalizeAmplitude(t *testing.T) {
	tests := []struct {
		name    string
		input   []float64
		wantMin float64
		wantMax float64
		wantLen int
	}{
		{
			name:    "normal range",
			input:   []float64{-0.5, 0.0, 0.5, 1.0, -1.0},
			wantMin: 0.0,
			wantMax: 1.0,
			wantLen: 5,
		},
		{
			name:    "all positive",
			input:   []float64{0.0, 0.25, 0.5, 0.75, 1.0},
			wantMin: 0.0,
			wantMax: 1.0,
			wantLen: 5,
		},
		{
			name:    "all negative",
			input:   []float64{-1.0, -0.5, -0.25, 0.0},
			wantMin: 0.0,
			wantMax: 1.0,
			wantLen: 4,
		},
		{
			name:    "single value",
			input:   []float64{0.5},
			wantMin: 1.0, // Single value normalized to 1.0 (0.5/0.5)
			wantMax: 1.0,
			wantLen: 1,
		},
		{
			name:    "zeros only",
			input:   []float64{0.0, 0.0, 0.0},
			wantMin: 0.0,
			wantMax: 0.0,
			wantLen: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeAmplitude(tt.input)

			if len(got) != tt.wantLen {
				t.Errorf("len = %d, want %d", len(got), tt.wantLen)
			}

			if len(got) > 0 {
				minVal := got[0]
				maxVal := got[0]
				for _, v := range got {
					if v < minVal {
						minVal = v
					}
					if v > maxVal {
						maxVal = v
					}
				}
				if abs(minVal-tt.wantMin) > 0.001 {
					t.Errorf("min = %f, want %f", minVal, tt.wantMin)
				}
				if abs(maxVal-tt.wantMax) > 0.001 {
					t.Errorf("max = %f, want %f", maxVal, tt.wantMax)
				}
			}
		})
	}
}

func TestDownsample(t *testing.T) {
	tests := []struct {
		name        string
		input       []float64
		targetCount int
		wantCount   int
	}{
		{
			name:        "downsample by 2",
			input:       []float64{1, 2, 3, 4, 5, 6, 7, 8},
			targetCount: 4,
			wantCount:   4,
		},
		{
			name:        "same size",
			input:       []float64{1, 2, 3, 4},
			targetCount: 4,
			wantCount:   4,
		},
		{
			name:        "upsample not supported",
			input:       []float64{1, 2},
			targetCount: 4,
			wantCount:   2, // Should return original when target > input
		},
		{
			name:        "empty input",
			input:       []float64{},
			targetCount: 10,
			wantCount:   0,
		},
		{
			name:        "single sample",
			input:       []float64{0.5},
			targetCount: 10,
			wantCount:   1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := downsample(tt.input, tt.targetCount)
			if len(got) != tt.wantCount {
				t.Errorf("len = %d, want %d", len(got), tt.wantCount)
			}
		})
	}
}

// Helper functions

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// createTestWAV creates a minimal valid WAV file for testing
func createTestWAV(t *testing.T, duration time.Duration) []byte {
	t.Helper()

	sampleRate := 16000
	numSamples := int(duration.Seconds() * float64(sampleRate))
	bytesPerSample := 2
	byteRate := sampleRate * bytesPerSample
	dataSize := numSamples * bytesPerSample

	// WAV header (44 bytes) + data
	wav := make([]byte, 44+dataSize)

	// RIFF header
	copy(wav[0:4], []byte("RIFF"))
	wav[4] = byte((36 + dataSize) & 0xFF)
	wav[5] = byte(((36 + dataSize) >> 8) & 0xFF)
	wav[6] = byte(((36 + dataSize) >> 16) & 0xFF)
	wav[7] = byte(((36 + dataSize) >> 24) & 0xFF)
	copy(wav[8:12], []byte("WAVE"))

	// fmt chunk
	copy(wav[12:16], []byte("fmt "))
	wav[16] = 16 // Subchunk1Size
	wav[20] = 1  // AudioFormat (PCM)
	wav[22] = 1  // NumChannels (mono)
	wav[24] = byte(sampleRate & 0xFF)
	wav[25] = byte((sampleRate >> 8) & 0xFF)
	wav[26] = byte((sampleRate >> 16) & 0xFF)
	wav[27] = byte((sampleRate >> 24) & 0xFF)
	wav[28] = byte(byteRate & 0xFF)
	wav[29] = byte((byteRate >> 8) & 0xFF)
	wav[30] = byte((byteRate >> 16) & 0xFF)
	wav[31] = byte((byteRate >> 24) & 0xFF)
	wav[32] = 2 // BlockAlign
	wav[33] = 0
	wav[34] = 16 // BitsPerSample
	wav[35] = 0

	// data chunk
	copy(wav[36:40], []byte("data"))
	wav[40] = byte(dataSize & 0xFF)
	wav[41] = byte((dataSize >> 8) & 0xFF)
	wav[42] = byte((dataSize >> 16) & 0xFF)
	wav[43] = byte((dataSize >> 24) & 0xFF)

	// Fill with silence (zeros)
	for i := 44; i < len(wav); i++ {
		wav[i] = 0
	}

	return wav
}

func TestQuoteLocation(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		expected string // expected to be contained in result
	}{
		{
			name:     "simple path",
			path:     "/home/user/video.mp4",
			expected: `"/home/user/video.mp4"`,
		},
		{
			name:     "path with spaces",
			path:     "/home/user/my video file.mp4",
			expected: `"/home/user/my video file.mp4"`,
		},
		{
			name:     "path with quotes",
			path:     `/home/user/"quoted".mp4`,
			expected: `"/home/user/`,
		},
		{
			name:     "path with newline",
			path:     "/home/user/video\n.mp4",
			expected: `"/home/user/video.mp4"`,
		},
		{
			name:     "path with carriage return",
			path:     "/home/user/video\r.mp4",
			expected: `"/home/user/video.mp4"`,
		},
		{
			name:     "path with both newlines",
			path:     "/home/user\n/video\r.mp4",
			expected: `"/home/user/video.mp4"`,
		},
		{
			name:     "empty path",
			path:     "",
			expected: `""`,
		},
		{
			name:     "path with special chars",
			path:     `/home/user/file!@#$%^&*().mp4`,
			expected: `"/home/user/file!@#$%^&*()`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := quoteLocation(tt.path)

			// Verify the result is properly quoted (starts and ends with double quote)
			if len(result) < 2 || result[0] != '"' || result[len(result)-1] != '"' {
				t.Errorf("quoteLocation(%q) = %q, expected quoted string", tt.path, result)
			}

			// Verify the expected content is present
			if !contains(result, tt.expected) {
				t.Errorf("quoteLocation(%q) = %q, expected to contain %q", tt.path, result, tt.expected)
			}

			// Verify newlines are removed
			if contains(result, "\n") || contains(result, "\r") {
				t.Errorf("quoteLocation(%q) = %q, should not contain newlines", tt.path, result)
			}
		})
	}
}
