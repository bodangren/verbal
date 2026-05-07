package realtime

import (
	"os"
	"testing"
)

func TestNewGstTranscriber(t *testing.T) {
	config := GstTranscriberConfig{
		AudioFormat:  "S16LE",
		SampleRate:   16000,
		Channels:     1,
		ProviderName: "openai",
	}

	gt := NewGstTranscriber(config)
	if gt == nil {
		t.Fatal("expected non-nil GstTranscriber")
	}
	if gt.State() != StateReady {
		t.Errorf("expected StateReady, got %v", gt.State())
	}
	if gt.audioFormat != "S16LE" {
		t.Errorf("expected audio format S16LE, got %s", gt.audioFormat)
	}
	if gt.sampleRate != 16000 {
		t.Errorf("expected sample rate 16000, got %d", gt.sampleRate)
	}
	if gt.channels != 1 {
		t.Errorf("expected channels 1, got %d", gt.channels)
	}
}

func TestNewGstTranscriber_Defaults(t *testing.T) {
	gt := NewGstTranscriber(GstTranscriberConfig{})

	if gt.audioFormat != "S16LE" {
		t.Errorf("expected default audio format S16LE, got %s", gt.audioFormat)
	}
	if gt.sampleRate != 16000 {
		t.Errorf("expected default sample rate 16000, got %d", gt.sampleRate)
	}
	if gt.channels != 1 {
		t.Errorf("expected default channels 1, got %d", gt.channels)
	}
}

func TestGstTranscriber_Start(t *testing.T) {
	gt := NewGstTranscriber(GstTranscriberConfig{})

	err := gt.Start()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if gt.State() != StateStreaming {
		t.Errorf("expected StateStreaming, got %v", gt.State())
	}
}

func TestGstTranscriber_Start_FromStreaming(t *testing.T) {
	gt := NewGstTranscriber(GstTranscriberConfig{})

	gt.Start()
	err := gt.Start()
	if err == nil {
		t.Error("expected error when starting from streaming state")
	}
}

func TestGstTranscriber_Stop(t *testing.T) {
	gt := NewGstTranscriber(GstTranscriberConfig{})

	gt.Start()
	err := gt.Stop()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if gt.State() != StateStopped {
		t.Errorf("expected StateStopped, got %v", gt.State())
	}
}

func TestGstTranscriber_Stop_FromReady(t *testing.T) {
	gt := NewGstTranscriber(GstTranscriberConfig{})

	err := gt.Stop()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if gt.State() != StateReady {
		t.Errorf("expected StateReady, got %v", gt.State())
	}
}

func TestGstTranscriber_PipelineString(t *testing.T) {
	gt := NewGstTranscriber(GstTranscriberConfig{
		AudioFormat: "S16LE",
		SampleRate:  16000,
		Channels:    1,
	})

	pipeline := gt.PipelineString("pulsesrc")
	expected := "pulsesrc ! queue ! audioconvert ! audioresample ! audio/x-raw,format=S16LE,rate=16000,channels=1 ! tcpserversink name=sink host=localhost port=0"

	if pipeline != expected {
		t.Errorf("pipeline mismatch:\n  got:  %s\n  want: %s", pipeline, expected)
	}
}

func TestGstTranscriber_ValidateAudioSource(t *testing.T) {
	gt := NewGstTranscriber(GstTranscriberConfig{})

	validSources := []string{
		"pulsesrc",
		"autoaudiosrc device=\"default\"",
		"alsasrc",
		"filesrc location=/path/to/file",
		"device://video0",
	}

	for _, source := range validSources {
		if !gt.ValidateAudioSource(source) {
			t.Errorf("expected source %q to be valid", source)
		}
	}

	invalidSources := []string{
		"invalid-source",
		"video source",
		"",
	}

	for _, source := range invalidSources {
		if gt.ValidateAudioSource(source) {
			t.Errorf("expected source %q to be invalid", source)
		}
	}
}

func TestGstTranscriber_GetAudioFormat(t *testing.T) {
	gt := NewGstTranscriber(GstTranscriberConfig{
		AudioFormat: "S16LE",
		SampleRate:  48000,
		Channels:    2,
	})

	format, rate, channels := gt.GetAudioFormat()
	if format != "S16LE" {
		t.Errorf("expected format S16LE, got %s", format)
	}
	if rate != 48000 {
		t.Errorf("expected rate 48000, got %d", rate)
	}
	if channels != 2 {
		t.Errorf("expected channels 2, got %d", channels)
	}
}

func TestGstTranscriber_OnWord(t *testing.T) {
	gt := NewGstTranscriber(GstTranscriberConfig{})

	var receivedWords []WordData
	gt.OnWord(func(word WordData) {
		receivedWords = append(receivedWords, word)
	})

	gt.emitWord(WordData{Text: "hello", StartTime: 0.0, EndTime: 0.5, Confidence: 0.95})

	if len(receivedWords) != 1 {
		t.Fatalf("expected 1 word, got %d", len(receivedWords))
	}
	if receivedWords[0].Text != "hello" {
		t.Errorf("expected 'hello', got %s", receivedWords[0].Text)
	}
}

func TestSanitizeLocationArg(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"path/to/file", "path/to/file"},
		{"path;rm -rf", "pathrm -rf"},
		{"path\"quote", "pathquote"},
		{"path\\backslash", "pathbackslash"},
		{"path\nnewline", "pathnewline"},
		{"path\rreturn", "pathreturn"},
	}

	for _, test := range tests {
		result := SanitizeLocationArg(test.input)
		if result != test.expected {
			t.Errorf("SanitizeLocationArg(%q) = %q, want %q", test.input, result, test.expected)
		}
	}
}

func TestEnsureDir(t *testing.T) {
	tmpDir := t.TempDir()
	path := tmpDir + "/subdir1/subdir2/file.txt"

	err := EnsureDir(path)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	_, err = os.Stat(tmpDir + "/subdir1/subdir2")
	if err != nil {
		t.Errorf("directory not created: %v", err)
	}
}

func TestGstTranscriber_Close(t *testing.T) {
	gt := NewGstTranscriber(GstTranscriberConfig{})

	gt.Start()
	err := gt.Close()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if gt.State() != StateStopped {
		t.Errorf("expected StateStopped, got %v", gt.State())
	}
}