package thumbnail

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"time"
)

const (
	defaultWidth       = 160
	defaultHeight      = 90
	defaultJPEGQuality = 85
)

// Image is a generated thumbnail payload.
type Image struct {
	Base64Data  string
	MIMEType    string
	GeneratedAt time.Time
	Width       int
	Height      int
	SizeBytes   int
}

// Extractor probes media metadata and extracts a video frame.
type Extractor interface {
	ProbeDuration(filePath string) (time.Duration, error)
	ExtractFrameToFile(filePath string, seekPosition time.Duration, outputPath string, width, height, jpegQuality int) error
}

// GeneratorConfig controls thumbnail generation behavior.
type GeneratorConfig struct {
	Width           int
	Height          int
	JPEGQuality     int
	TargetOffset    time.Duration
	ShortVideoRatio float64
	PipelineTimeout time.Duration
}

// DefaultGeneratorConfig returns production defaults for thumbnail generation.
func DefaultGeneratorConfig() GeneratorConfig {
	return GeneratorConfig{
		Width:           defaultWidth,
		Height:          defaultHeight,
		JPEGQuality:     defaultJPEGQuality,
		TargetOffset:    1 * time.Second,
		ShortVideoRatio: 0.10,
		PipelineTimeout: 5 * time.Second,
	}
}

// Generator produces thumbnails from video files.
type Generator struct {
	config    GeneratorConfig
	extractor Extractor
}

// NewGenerator creates a generator backed by the GStreamer extractor.
func NewGenerator(config GeneratorConfig) *Generator {
	return NewGeneratorWithExtractor(config, NewGStreamerExtractor(config.PipelineTimeout))
}

// NewGeneratorWithExtractor creates a generator with a custom extraction backend.
func NewGeneratorWithExtractor(config GeneratorConfig, extractor Extractor) *Generator {
	cfg := normalizeGeneratorConfig(config)
	if extractor == nil {
		extractor = NewGStreamerExtractor(cfg.PipelineTimeout)
	}

	return &Generator{config: cfg, extractor: extractor}
}

// Generate creates a 160x90-style JPEG thumbnail payload from the provided video.
func (g *Generator) Generate(filePath string) (*Image, error) {
	if filePath == "" {
		return nil, errors.New("file path is empty")
	}

	info, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("stat video file: %w", err)
	}
	if info.IsDir() {
		return nil, errors.New("video path points to a directory")
	}

	duration, err := g.extractor.ProbeDuration(filePath)
	if err != nil {
		return nil, fmt.Errorf("probe duration: %w", err)
	}

	seekPosition := selectSeekPosition(duration, g.config.TargetOffset, g.config.ShortVideoRatio)
	tmpFile, err := os.CreateTemp("", "verbal-thumbnail-*.jpg")
	if err != nil {
		return nil, fmt.Errorf("create temp thumbnail file: %w", err)
	}
	tmpPath := tmpFile.Name()
	_ = tmpFile.Close()
	defer os.Remove(tmpPath)

	if err := g.extractor.ExtractFrameToFile(
		filePath,
		seekPosition,
		tmpPath,
		g.config.Width,
		g.config.Height,
		g.config.JPEGQuality,
	); err != nil {
		if !errors.Is(err, ErrSeekFailed) || seekPosition == 0 {
			return nil, fmt.Errorf("extract thumbnail frame: %w", err)
		}

		if retryErr := g.extractor.ExtractFrameToFile(
			filePath,
			0,
			tmpPath,
			g.config.Width,
			g.config.Height,
			g.config.JPEGQuality,
		); retryErr != nil {
			return nil, fmt.Errorf("extract thumbnail frame: %w (fallback to first frame failed: %v)", err, retryErr)
		}
	}

	imageBytes, err := os.ReadFile(tmpPath)
	if err != nil {
		return nil, fmt.Errorf("read generated thumbnail: %w", err)
	}
	if len(imageBytes) == 0 {
		return nil, errors.New("generated thumbnail is empty")
	}

	return &Image{
		Base64Data:  base64.StdEncoding.EncodeToString(imageBytes),
		MIMEType:    "image/jpeg",
		GeneratedAt: time.Now().UTC(),
		Width:       g.config.Width,
		Height:      g.config.Height,
		SizeBytes:   len(imageBytes),
	}, nil
}

// GenerateAsync generates a thumbnail without blocking the caller.
func (g *Generator) GenerateAsync(
	ctx context.Context,
	filePath string,
	onProgress func(float64),
	onComplete func(*Image, error),
) error {
	go func() {
		emitProgress(onProgress, 0.0)

		select {
		case <-ctx.Done():
			emitComplete(onComplete, nil, ctx.Err())
			return
		default:
		}

		emitProgress(onProgress, 0.5)
		img, err := g.Generate(filePath)

		select {
		case <-ctx.Done():
			emitComplete(onComplete, nil, ctx.Err())
			return
		default:
		}

		emitProgress(onProgress, 1.0)
		emitComplete(onComplete, img, err)
	}()

	return nil
}

func normalizeGeneratorConfig(config GeneratorConfig) GeneratorConfig {
	cfg := config
	if cfg.Width <= 0 {
		cfg.Width = defaultWidth
	}
	if cfg.Height <= 0 {
		cfg.Height = defaultHeight
	}
	if cfg.JPEGQuality <= 0 || cfg.JPEGQuality > 100 {
		cfg.JPEGQuality = defaultJPEGQuality
	}
	if cfg.TargetOffset <= 0 {
		cfg.TargetOffset = 1 * time.Second
	}
	if cfg.ShortVideoRatio <= 0 || cfg.ShortVideoRatio >= 1 {
		cfg.ShortVideoRatio = 0.10
	}
	if cfg.PipelineTimeout <= 0 {
		cfg.PipelineTimeout = 5 * time.Second
	}
	return cfg
}

func selectSeekPosition(duration, targetOffset time.Duration, shortVideoRatio float64) time.Duration {
	if duration <= 0 {
		return 0
	}
	if duration < targetOffset {
		seek := time.Duration(float64(duration) * shortVideoRatio)
		if seek < 0 {
			return 0
		}
		return seek
	}
	return targetOffset
}

func emitProgress(callback func(float64), progress float64) {
	if callback != nil {
		callback(progress)
	}
}

func emitComplete(callback func(*Image, error), image *Image, err error) {
	if callback != nil {
		callback(image, err)
	}
}
