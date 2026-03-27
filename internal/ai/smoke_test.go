package ai

import (
	"context"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

func generateTestWAV(t *testing.T) string {
	t.Helper()
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "test.wav")

	sampleRate := 16000
	durationSeconds := 1
	numSamples := sampleRate * durationSeconds

	buf := make([]byte, 44+numSamples*2)
	copy(buf[0:4], []byte("RIFF"))
	binary.LittleEndian.PutUint32(buf[4:8], uint32(36+numSamples*2))
	copy(buf[8:12], []byte("WAVE"))
	copy(buf[12:16], []byte("fmt "))
	binary.LittleEndian.PutUint32(buf[16:20], 16)
	binary.LittleEndian.PutUint16(buf[20:22], 1)
	binary.LittleEndian.PutUint16(buf[22:24], 1)
	binary.LittleEndian.PutUint32(buf[24:28], uint32(sampleRate))
	binary.LittleEndian.PutUint32(buf[28:32], uint32(sampleRate*2))
	binary.LittleEndian.PutUint16(buf[32:34], 2)
	binary.LittleEndian.PutUint16(buf[34:36], 16)
	copy(buf[36:40], []byte("data"))
	binary.LittleEndian.PutUint32(buf[40:44], uint32(numSamples*2))

	for i := 0; i < numSamples; i++ {
		sample := int16(0)
		binary.LittleEndian.PutUint16(buf[44+i*2:46+i*2], uint16(sample))
	}

	if err := os.WriteFile(path, buf, 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestSmokeOpenAITranscription(t *testing.T) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		t.Skip("OPENAI_API_KEY not set, skipping smoke test")
	}

	audioPath := generateTestWAV(t)
	provider := NewOpenAIProvider(apiKey)

	result, err := provider.Transcribe(context.Background(), audioPath)
	if err != nil {
		t.Fatalf("OpenAI transcription failed: %v", err)
	}

	t.Logf("Transcription result: text=%q language=%q duration=%.2f words=%d",
		result.Text, result.Language, result.Duration, len(result.Words))

	if result.Text == "" {
		t.Error("expected non-empty transcription text")
	}
}

func TestSmokeGoogleTranscription(t *testing.T) {
	apiKey := os.Getenv("GOOGLE_API_KEY")
	if apiKey == "" {
		t.Skip("GOOGLE_API_KEY not set, skipping smoke test")
	}

	audioPath := generateTestWAV(t)
	provider := NewGoogleProvider(apiKey)

	result, err := provider.Transcribe(context.Background(), audioPath)
	if err != nil {
		t.Fatalf("Google transcription failed: %v", err)
	}

	t.Logf("Transcription result: text=%q words=%d",
		result.Text, len(result.Words))
}

func TestGenerateTestWAV(t *testing.T) {
	path := generateTestWAV(t)

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() < 44 {
		t.Errorf("WAV file too small: %d bytes", info.Size())
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data[0:4]) != "RIFF" {
		t.Error("WAV file should start with RIFF")
	}
	if string(data[8:12]) != "WAVE" {
		t.Error("WAV file should have WAVE header")
	}
}
