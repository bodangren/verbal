package filler

import (
	"testing"
)

func TestFillerCache_GetSet(t *testing.T) {
	cache := NewFillerCache()

	recID := int64(123)
	filler := &FillerWord{Text: "um", Start: 1.0, End: 1.2, Type: TypeShortFiller}

	if _, ok := cache.Get(recID); ok {
		t.Error("Expected cache to be empty initially")
	}

	cache.Set(recID, []*FillerWord{filler})

	result, ok := cache.Get(recID)
	if !ok {
		t.Fatal("Expected to find cached result")
	}
	if len(result) != 1 {
		t.Fatalf("Expected 1 filler, got %d", len(result))
	}
	if result[0].Text != "um" {
		t.Errorf("Expected 'um', got %q", result[0].Text)
	}
}

func TestFillerCache_Clear(t *testing.T) {
	cache := NewFillerCache()
	recID := int64(456)

	cache.Set(recID, []*FillerWord{{Text: "uh", Start: 2.0, End: 2.1, Type: TypeShortFiller}})

	cache.Clear(recID)

	if _, ok := cache.Get(recID); ok {
		t.Error("Expected cache to be empty after Clear")
	}
}

func TestFillerService_NewFillerService(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	svc := NewFillerService(detector)

	if svc == nil {
		t.Fatal("NewFillerService returned nil")
	}
	if svc.detector == nil {
		t.Error("Expected detector to be set")
	}
	if svc.cache == nil {
		t.Error("Expected cache to be initialized")
	}
}

func TestFillerService_WithProgressCallback(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	var progressCalls []string

	svc := NewFillerService(detector, WithProgressCallback(func(percent int, msg string) {
		progressCalls = append(progressCalls, msg)
	}))

	svc.SetProgressCallback(func(percent int, msg string) {
		progressCalls = append(progressCalls, msg)
	})

	if len(progressCalls) != 0 {
		t.Error("Progress callback should not be called during construction")
	}
}

func TestFillerService_Detect(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	svc := NewFillerService(detector)

	transcriptionJSON := `{"words": [{"text": "hello", "start": 0, "end": 0.5}, {"text": "um", "start": 0.5, "end": 0.7}, {"text": "world", "start": 0.7, "end": 1.2}]}`

	fillers, err := svc.Detect(transcriptionJSON)
	if err != nil {
		t.Fatalf("Detect failed: %v", err)
	}

	if len(fillers) != 1 {
		t.Fatalf("Expected 1 filler, got %d", len(fillers))
	}
	if fillers[0].Text != "um" {
		t.Errorf("Expected 'um', got %q", fillers[0].Text)
	}
	if fillers[0].Type != TypeShortFiller {
		t.Errorf("Expected TypeShortFiller, got %v", fillers[0].Type)
	}
}

func TestFillerService_Detect_NoFillers(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	svc := NewFillerService(detector)

	transcriptionJSON := `{"words": [{"text": "hello", "start": 0, "end": 0.5}, {"text": "world", "start": 0.5, "end": 1.0}]}`

	fillers, err := svc.Detect(transcriptionJSON)
	if err != nil {
		t.Fatalf("Detect failed: %v", err)
	}

	if len(fillers) != 0 {
		t.Errorf("Expected 0 fillers, got %d", len(fillers))
	}
}

func TestFillerService_Detect_EmptyJSON(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	svc := NewFillerService(detector)

	fillers, err := svc.Detect("")
	if err != nil {
		t.Fatalf("Detect failed: %v", err)
	}

	if len(fillers) != 0 {
		t.Errorf("Expected 0 fillers for empty JSON, got %d", len(fillers))
	}
}

func TestFillerService_Detect_InvalidJSON(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	svc := NewFillerService(detector)

	_, err := svc.Detect("invalid json")
	if err == nil {
		t.Error("Expected error for invalid JSON")
	}
}

func TestFillerService_DetectFromCache(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	svc := NewFillerService(detector)

	recID := int64(789)
	transcriptionJSON := `{"words": [{"text": "hi", "start": 0, "end": 0.3}, {"text": "um", "start": 0.3, "end": 0.5}]}`

	fillers, err := svc.DetectFromCache(recID, transcriptionJSON)
	if err != nil {
		t.Fatalf("DetectFromCache failed: %v", err)
	}
	if len(fillers) != 1 {
		t.Fatalf("Expected 1 filler, got %d", len(fillers))
	}

	fillers2, err := svc.DetectFromCache(recID, "should use cached result")
	if err != nil {
		t.Fatalf("DetectFromCache failed on cached call: %v", err)
	}
	if len(fillers2) != 1 {
		t.Fatalf("Expected cached result to have 1 filler, got %d", len(fillers2))
	}
}

func TestFillerService_GetCached(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	svc := NewFillerService(detector)

	recID := int64(999)

	if _, ok := svc.GetCached(recID); ok {
		t.Error("Expected no cached result initially")
	}

	svc.cache.Set(recID, []*FillerWord{{Text: "uh", Start: 1.0, End: 1.2, Type: TypeShortFiller}})

	if _, ok := svc.GetCached(recID); !ok {
		t.Error("Expected to find cached result")
	}
}

func TestFillerService_ClearCache(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	svc := NewFillerService(detector)

	recID := int64(111)
	svc.cache.Set(recID, []*FillerWord{{Text: "ah", Start: 0.5, End: 0.7, Type: TypeShortFiller}})

	svc.ClearCache(recID)

	if _, ok := svc.GetCached(recID); ok {
		t.Error("Expected cache to be cleared")
	}
}

func TestFillerService_Detect_Hesitation(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	svc := NewFillerService(detector)

	transcriptionJSON := `{"words": [{"text": "I", "start": 0, "end": 0.1}, {"text": "you", "start": 0.1, "end": 0.2}, {"text": "know", "start": 0.2, "end": 0.4}, {"text": "stuff", "start": 0.4, "end": 1.0}]}`

	fillers, err := svc.Detect(transcriptionJSON)
	if err != nil {
		t.Fatalf("Detect failed: %v", err)
	}

	if len(fillers) != 1 {
		t.Fatalf("Expected 1 filler (you/know phrase), got %d", len(fillers))
	}
	if fillers[0].Type != TypeHesitation {
		t.Errorf("Expected TypeHesitation, got %v", fillers[0].Type)
	}
}

func TestFillerService_Detect_Repetition(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	svc := NewFillerService(detector)

	transcriptionJSON := `{"words": [{"text": "the", "start": 0, "end": 0.1}, {"text": "the", "start": 0.15, "end": 0.25}, {"text": "the", "start": 0.30, "end": 0.4}, {"text": "problem", "start": 0.5, "end": 0.8}]}`

	fillers, err := svc.Detect(transcriptionJSON)
	if err != nil {
		t.Fatalf("Detect failed: %v", err)
	}

	if len(fillers) < 1 {
		t.Error("Expected at least 1 repetition filler")
	}
	for _, f := range fillers {
		if f.Type != TypeRepetition {
			t.Errorf("Expected TypeRepetition, got %v", f.Type)
		}
	}
}

func TestFillerService_DetectWithProgress(t *testing.T) {
	detector := NewDefaultDetector(DefaultConfig())
	var progressCalls []struct{ percent int; message string }

	svc := NewFillerService(detector, WithProgressCallback(func(percent int, msg string) {
		progressCalls = append(progressCalls, struct{ percent int; message string }{percent, msg})
	}))

	transcriptionJSON := `{"words": [{"text": "um", "start": 0, "end": 0.2}]}`

	_, err := svc.Detect(transcriptionJSON)
	if err != nil {
		t.Fatalf("Detect failed: %v", err)
	}

	if len(progressCalls) < 2 {
		t.Errorf("Expected at least 2 progress calls, got %d", len(progressCalls))
	}

	if progressCalls[len(progressCalls)-1].percent != 100 {
		t.Errorf("Expected final progress to be 100, got %d", progressCalls[len(progressCalls)-1].percent)
	}
}

func TestParseTranscriptionJSON(t *testing.T) {
	tests := []struct {
		name    string
		json    string
		wantErr bool
		wantLen int
	}{
		{"valid", `{"words": [{"text": "hi", "start": 0, "end": 0.5}]}`, false, 1},
		{"empty", "", false, 0},
		{"invalid", "not json", true, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := ParseTranscriptionJSON(tt.json)
			if tt.wantErr && err == nil {
				t.Error("Expected error")
			}
			if !tt.wantErr && err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
			if !tt.wantErr && data != nil && len(data.Words) != tt.wantLen {
				t.Errorf("Expected %d words, got %d", tt.wantLen, len(data.Words))
			}
		})
	}
}