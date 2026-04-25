package filler

import (
	"testing"
	"time"
)

func TestFillerWord_Types(t *testing.T) {
	tests := []struct {
		name     string
		filler   FillerWord
		expected FillerType
	}{
		{"um is short filler", FillerWord{Text: "um", Type: TypeShortFiller}, TypeShortFiller},
		{"uh is short filler", FillerWord{Text: "uh", Type: TypeShortFiller}, TypeShortFiller},
		{"like is hesitation", FillerWord{Text: "like", Type: TypeHesitation}, TypeHesitation},
		{"you know is hesitation", FillerWord{Text: "you know", Type: TypeHesitation}, TypeHesitation},
		{"the the is repetition", FillerWord{Text: "the", Type: TypeRepetition}, TypeRepetition},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.filler.Type != tt.expected {
				t.Errorf("expected type %v, got %v", tt.expected, tt.filler.Type)
			}
		})
	}
}

func TestFillerType_String(t *testing.T) {
	if TypeShortFiller.String() != "short_filler" {
		t.Errorf("expected 'short_filler', got %s", TypeShortFiller.String())
	}
	if TypeHesitation.String() != "hesitation" {
		t.Errorf("expected 'hesitation', got %s", TypeHesitation.String())
	}
	if TypeRepetition.String() != "repetition" {
		t.Errorf("expected 'repetition', got %s", TypeRepetition.String())
	}
	if TypeUnknown.String() != "unknown" {
		t.Errorf("expected 'unknown', got %s", TypeUnknown.String())
	}
}

func TestDefaultDetector_Detect_Empty(t *testing.T) {
	d := NewDefaultDetector(DefaultConfig())
	words := []Word{}
	result := d.Detect(words)

	if len(result) != 0 {
		t.Errorf("expected empty result for empty input, got %d items", len(result))
	}
}

func TestDefaultDetector_Detect_ShortFillers(t *testing.T) {
	d := NewDefaultDetector(DefaultConfig())

	words := []Word{
		{Text: "hello", Start: 0.0, End: 0.5},
		{Text: "um", Start: 0.5, End: 0.7},
		{Text: "world", Start: 0.7, End: 1.2},
	}

	result := d.Detect(words)

	if len(result) != 1 {
		t.Fatalf("expected 1 filler, got %d", len(result))
	}
	if result[0].Text != "um" {
		t.Errorf("expected 'um', got %s", result[0].Text)
	}
	if result[0].Type != TypeShortFiller {
		t.Errorf("expected TypeShortFiller, got %v", result[0].Type)
	}
}

func TestDefaultDetector_Detect_Hesitation(t *testing.T) {
	d := NewDefaultDetector(DefaultConfig())

	words := []Word{
		{Text: "I", Start: 0.0, End: 0.2},
		{Text: "like", Start: 0.2, End: 0.5},
		{Text: "um", Start: 0.5, End: 0.7},
		{Text: "know", Start: 0.7, End: 1.0},
		{Text: "what", Start: 1.0, End: 1.3},
		{Text: "I", Start: 1.3, End: 1.5},
		{Text: "mean", Start: 1.5, End: 1.8},
	}

	result := d.Detect(words)

	hesitations := filterByType(result, TypeHesitation)
	if len(hesitations) != 1 {
		t.Errorf("expected 1 hesitation pattern ('like um know' or 'I mean'), got %d", len(hesitations))
	}
}

func TestDefaultDetector_Detect_Hesitation_Multiple(t *testing.T) {
	d := NewDefaultDetector(DefaultConfig())

	words := []Word{
		{Text: "so", Start: 0.0, End: 0.3},
		{Text: "basically", Start: 0.3, End: 0.7},
		{Text: "I", Start: 0.7, End: 0.9},
		{Text: "think", Start: 0.9, End: 1.1},
		{Text: "actually", Start: 1.1, End: 1.5},
		{Text: "this", Start: 1.5, End: 1.8},
		{Text: "is", Start: 1.8, End: 2.0},
	}

	result := d.Detect(words)

	hesitations := filterByType(result, TypeHesitation)
	if len(hesitations) != 3 {
		t.Errorf("expected 3 hesitations (so, basically, actually), got %d: %v", len(hesitations), hesitations)
	}
}

func TestDefaultDetector_Detect_Repetition(t *testing.T) {
	d := NewDefaultDetector(DefaultConfig())

	words := []Word{
		{Text: "the", Start: 0.0, End: 0.3},
		{Text: "the", Start: 0.5, End: 0.8},
		{Text: "book", Start: 1.5, End: 2.0},
	}

	result := d.Detect(words)

	repetitions := filterByType(result, TypeRepetition)
	if len(repetitions) != 1 {
		t.Errorf("expected 1 repetition, got %d", len(repetitions))
	}
}

func TestDefaultDetector_Detect_Repetition_OutsideWindow(t *testing.T) {
	d := NewDefaultDetector(DefaultConfig())

	words := []Word{
		{Text: "the", Start: 0.0, End: 0.3},
		{Text: "the", Start: 5.0, End: 5.3},
		{Text: "book", Start: 6.0, End: 6.5},
	}

	result := d.Detect(words)

	repetitions := filterByType(result, TypeRepetition)
	if len(repetitions) != 0 {
		t.Errorf("expected 0 repetitions (outside 2s window), got %d", len(repetitions))
	}
}

func TestDefaultDetector_Detect_CaseInsensitive(t *testing.T) {
	d := NewDefaultDetector(DefaultConfig())

	words := []Word{
		{Text: "Um", Start: 0.0, End: 0.3},
		{Text: "UH", Start: 0.5, End: 0.8},
		{Text: "LIKE", Start: 1.0, End: 1.4},
	}

	result := d.Detect(words)

	if len(result) != 3 {
		t.Errorf("expected 3 fillers (case insensitive), got %d", len(result))
	}
}

func TestDefaultDetector_Detect_DisabledShortFillers(t *testing.T) {
	cfg := DefaultConfig()
	cfg.EnableShortFillers = false
	d := NewDefaultDetector(cfg)

	words := []Word{
		{Text: "hello", Start: 0.0, End: 0.5},
		{Text: "um", Start: 0.5, End: 0.7},
	}

	result := d.Detect(words)

	if len(result) != 0 {
		t.Errorf("expected 0 fillers with short fillers disabled, got %d", len(result))
	}
}

func TestDefaultDetector_Detect_DisabledHesitation(t *testing.T) {
	cfg := DefaultConfig()
	cfg.EnableHesitation = false
	d := NewDefaultDetector(cfg)

	words := []Word{
		{Text: "I", Start: 0.0, End: 0.2},
		{Text: "like", Start: 0.2, End: 0.5},
		{Text: "you", Start: 0.5, End: 0.7},
		{Text: "know", Start: 0.7, End: 1.0},
	}

	result := d.Detect(words)

	hesitations := filterByType(result, TypeHesitation)
	if len(hesitations) != 0 {
		t.Errorf("expected 0 hesitations with hesitation disabled, got %d", len(hesitations))
	}
}

func TestDefaultDetector_Detect_DisabledRepetition(t *testing.T) {
	cfg := DefaultConfig()
	cfg.EnableRepetition = false
	d := NewDefaultDetector(cfg)

	words := []Word{
		{Text: "the", Start: 0.0, End: 0.3},
		{Text: "the", Start: 0.5, End: 0.8},
	}

	result := d.Detect(words)

	repetitions := filterByType(result, TypeRepetition)
	if len(repetitions) != 0 {
		t.Errorf("expected 0 repetitions with repetition disabled, got %d", len(repetitions))
	}
}

func TestDefaultDetector_Detect_AllTypes(t *testing.T) {
	d := NewDefaultDetector(DefaultConfig())

	words := []Word{
		{Text: "hello", Start: 0.0, End: 0.5},
		{Text: "um", Start: 0.5, End: 0.7},
		{Text: "I", Start: 0.7, End: 0.9},
		{Text: "like", Start: 0.9, End: 1.2},
		{Text: "the", Start: 1.5, End: 1.8},
		{Text: "the", Start: 1.9, End: 2.2},
		{Text: "book", Start: 2.5, End: 3.0},
	}

	result := d.Detect(words)

	if len(result) != 3 {
		t.Errorf("expected 3 fillers, got %d: %v", len(result), result)
	}
}

func filterByType(fillers []*FillerWord, typ FillerType) []*FillerWord {
	var result []*FillerWord
	for _, f := range fillers {
		if f.Type == typ {
			result = append(result, f)
		}
	}
	return result
}

func TestWord_StartTime(t *testing.T) {
	w := Word{Text: "hello", Start: 1.5, End: 2.0}
	expected := time.Duration(1.5 * float64(time.Second))
	if w.StartTime() != expected {
		t.Errorf("expected %v, got %v", expected, w.StartTime())
	}
}

func TestWord_EndTime(t *testing.T) {
	w := Word{Text: "hello", Start: 1.5, End: 2.0}
	expected := time.Duration(2.0 * float64(time.Second))
	if w.EndTime() != expected {
		t.Errorf("expected %v, got %v", expected, w.EndTime())
	}
}

func TestConfig_Default(t *testing.T) {
	cfg := DefaultConfig()
	if !cfg.EnableShortFillers {
		t.Error("expected EnableShortFillers to be true by default")
	}
	if !cfg.EnableHesitation {
		t.Error("expected EnableHesitation to be true by default")
	}
	if !cfg.EnableRepetition {
		t.Error("expected EnableRepetition to be true by default")
	}
	if cfg.RepetitionWindow != 2.0 {
		t.Errorf("expected RepetitionWindow to be 2.0, got %f", cfg.RepetitionWindow)
	}
}