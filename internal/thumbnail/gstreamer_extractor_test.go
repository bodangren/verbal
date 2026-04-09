package thumbnail

import (
	"strings"
	"testing"
	"time"
)

func TestNewGStreamerExtractor_DefaultTimeout(t *testing.T) {
	extractor := NewGStreamerExtractor(0)
	if extractor.timeout <= 0 {
		t.Fatal("Expected default timeout to be set")
	}
}

func TestGStreamerExtractor_ExtractFrameToFile_Validation(t *testing.T) {
	extractor := NewGStreamerExtractor(100 * time.Millisecond)

	if err := extractor.ExtractFrameToFile("/tmp/a.mp4", 0, "/tmp/out.jpg", 0, 90, 85); err == nil {
		t.Fatal("Expected width validation error")
	}
	if err := extractor.ExtractFrameToFile("/tmp/a.mp4", 0, "/tmp/out.jpg", 160, 90, 0); err == nil {
		t.Fatal("Expected JPEG quality validation error")
	}
}

func TestGStreamerExtractor_ProbeDuration_MissingFile(t *testing.T) {
	extractor := NewGStreamerExtractor(150 * time.Millisecond)
	_, err := extractor.ProbeDuration("/path/that/does/not/exist.mp4")
	if err == nil {
		t.Fatal("Expected ProbeDuration error for missing source")
	}
}

func TestGStreamerExtractor_ExtractFrameToFile_MissingFile(t *testing.T) {
	extractor := NewGStreamerExtractor(200 * time.Millisecond)
	err := extractor.ExtractFrameToFile(
		"/path/that/does/not/exist.mp4",
		0,
		"/tmp/verbal-nonexistent-thumb.jpg",
		160,
		90,
		85,
	)
	if err == nil {
		t.Fatal("Expected extraction error for missing source")
	}
}

func TestQuoteLocation_SanitizesNewlines(t *testing.T) {
	quoted := quoteLocation("/tmp/a\n\r.mp4")
	if strings.Contains(quoted, "\n") || strings.Contains(quoted, "\r") {
		t.Fatalf("Expected quoted location to strip newlines, got %q", quoted)
	}
	if !strings.HasPrefix(quoted, "\"") || !strings.HasSuffix(quoted, "\"") {
		t.Fatalf("Expected quoted path to be wrapped in double quotes, got %q", quoted)
	}
}
