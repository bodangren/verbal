package thumbnail

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type fakeExtractor struct {
	duration         time.Duration
	probeErr         error
	extractErr       error
	extractErrs      []error
	extractCalls     int
	lastSeekPosition time.Duration
	seekPositions    []time.Duration
	lastWidth        int
	lastHeight       int
	lastJPEGQuality  int
	lastOutputPath   string
	thumbnailPayload []byte
}

func (f *fakeExtractor) ProbeDuration(string) (time.Duration, error) {
	if f.probeErr != nil {
		return 0, f.probeErr
	}
	return f.duration, nil
}

func (f *fakeExtractor) ExtractFrameToFile(_ string, seekPosition time.Duration, outputPath string, width, height, jpegQuality int) error {
	f.extractCalls++
	f.seekPositions = append(f.seekPositions, seekPosition)
	if len(f.extractErrs) > 0 {
		err := f.extractErrs[0]
		f.extractErrs = f.extractErrs[1:]
		if err != nil {
			return err
		}
	}
	if f.extractErr != nil {
		return f.extractErr
	}
	f.lastSeekPosition = seekPosition
	f.lastWidth = width
	f.lastHeight = height
	f.lastJPEGQuality = jpegQuality
	f.lastOutputPath = outputPath

	payload := f.thumbnailPayload
	if len(payload) == 0 {
		payload = []byte("fake-jpeg")
	}
	return os.WriteFile(outputPath, payload, 0o644)
}

func TestGenerator_Generate_UsesShortVideoSeekRule(t *testing.T) {
	tmpDir := t.TempDir()
	videoPath := filepath.Join(tmpDir, "video.mp4")
	if err := os.WriteFile(videoPath, []byte("dummy"), 0o644); err != nil {
		t.Fatalf("write video fixture: %v", err)
	}

	extractor := &fakeExtractor{duration: 500 * time.Millisecond}
	gen := NewGeneratorWithExtractor(DefaultGeneratorConfig(), extractor)

	image, err := gen.Generate(videoPath)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if image == nil {
		t.Fatal("Generate() returned nil image")
	}

	if extractor.lastSeekPosition != 50*time.Millisecond {
		t.Errorf("Expected short-video seek at 50ms, got %v", extractor.lastSeekPosition)
	}
	if extractor.lastWidth != 160 || extractor.lastHeight != 90 {
		t.Errorf("Expected 160x90 extraction, got %dx%d", extractor.lastWidth, extractor.lastHeight)
	}
	if extractor.lastJPEGQuality != 85 {
		t.Errorf("Expected JPEG quality 85, got %d", extractor.lastJPEGQuality)
	}
	if image.MIMEType != "image/jpeg" {
		t.Errorf("Expected MIME type image/jpeg, got %q", image.MIMEType)
	}
	if image.Base64Data == "" {
		t.Error("Expected non-empty base64 thumbnail payload")
	}
}

func TestGenerator_Generate_ErrorPropagation(t *testing.T) {
	tmpDir := t.TempDir()
	videoPath := filepath.Join(tmpDir, "video.mp4")
	if err := os.WriteFile(videoPath, []byte("dummy"), 0o644); err != nil {
		t.Fatalf("write video fixture: %v", err)
	}

	extractor := &fakeExtractor{probeErr: errors.New("probe failed")}
	gen := NewGeneratorWithExtractor(DefaultGeneratorConfig(), extractor)

	_, err := gen.Generate(videoPath)
	if err == nil {
		t.Fatal("Expected Generate() to fail when duration probing fails")
	}
}

func TestGenerator_Generate_FallsBackToFirstFrameWhenSeekFails(t *testing.T) {
	tmpDir := t.TempDir()
	videoPath := filepath.Join(tmpDir, "video.mp4")
	if err := os.WriteFile(videoPath, []byte("dummy"), 0o644); err != nil {
		t.Fatalf("write video fixture: %v", err)
	}

	extractor := &fakeExtractor{
		duration:    2 * time.Second,
		extractErrs: []error{ErrSeekFailed, nil},
	}
	gen := NewGeneratorWithExtractor(DefaultGeneratorConfig(), extractor)

	image, err := gen.Generate(videoPath)
	if err != nil {
		t.Fatalf("Generate() should fall back to first frame after seek failure: %v", err)
	}
	if image == nil {
		t.Fatal("Generate() returned nil image")
	}
	if extractor.extractCalls != 2 {
		t.Fatalf("Expected 2 extraction attempts, got %d", extractor.extractCalls)
	}
	if len(extractor.seekPositions) != 2 {
		t.Fatalf("Expected 2 seek positions, got %d", len(extractor.seekPositions))
	}
	if extractor.seekPositions[0] != time.Second {
		t.Fatalf("Expected first attempt at 1s, got %v", extractor.seekPositions[0])
	}
	if extractor.seekPositions[1] != 0 {
		t.Fatalf("Expected fallback attempt at first frame, got %v", extractor.seekPositions[1])
	}
}

func TestGenerator_GenerateAsync_RespectsContextCancellation(t *testing.T) {
	gen := NewGeneratorWithExtractor(DefaultGeneratorConfig(), &fakeExtractor{})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan error, 1)
	if err := gen.GenerateAsync(ctx, "/tmp/does-not-matter.mp4", nil, func(_ *Image, err error) {
		done <- err
	}); err != nil {
		t.Fatalf("GenerateAsync() returned start error: %v", err)
	}

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Expected context.Canceled, got %v", err)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("Timed out waiting for GenerateAsync completion callback")
	}
}

func TestSelectSeekPosition(t *testing.T) {
	if got := selectSeekPosition(2*time.Second, 1*time.Second, 0.10); got != 1*time.Second {
		t.Errorf("Expected fixed 1s seek for >=1s video, got %v", got)
	}
	if got := selectSeekPosition(400*time.Millisecond, 1*time.Second, 0.10); got != 40*time.Millisecond {
		t.Errorf("Expected 10%% seek for short video, got %v", got)
	}
}
