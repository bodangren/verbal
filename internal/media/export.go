package media

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

// Segment represents a video segment to export.
type Segment struct {
	StartTime  float64
	EndTime    float64
	OutputPath string
}

// SegmentExporter handles exporting selected transcription segments as video clips.
// It uses GStreamer to trim and concatenate video segments.
type SegmentExporter struct {
	sourcePath string
	mu         sync.Mutex
	onProgress func(percent float64)
	onComplete func(outputPath string)
	onError    func(error)
}

// NewSegmentExporter creates a new exporter for the given source video file.
func NewSegmentExporter(sourcePath string) *SegmentExporter {
	return &SegmentExporter{
		sourcePath: sourcePath,
	}
}

// SetProgressHandler sets the callback for progress updates (0.0 to 1.0).
func (e *SegmentExporter) SetProgressHandler(handler func(percent float64)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onProgress = handler
}

// SetCompleteHandler sets the callback for successful export completion.
func (e *SegmentExporter) SetCompleteHandler(handler func(outputPath string)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onComplete = handler
}

// SetErrorHandler sets the callback for export errors.
func (e *SegmentExporter) SetErrorHandler(handler func(error)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onError = handler
}

// ExportSegments exports the given segments to a new video file.
// Segments are trimmed from the source video and concatenated together.
// The outputPath is the destination file path for the exported video.
// This method runs asynchronously and reports progress via callbacks.
func (e *SegmentExporter) ExportSegments(segments []Segment, outputPath string) {
	go func() {
		if err := e.export(segments, outputPath); err != nil {
			e.mu.Lock()
			handler := e.onError
			e.mu.Unlock()
			if handler != nil {
				handler(err)
			}
		} else {
			e.mu.Lock()
			handler := e.onComplete
			e.mu.Unlock()
			if handler != nil {
				handler(outputPath)
			}
		}
	}()
}

func (e *SegmentExporter) export(segments []Segment, outputPath string) error {
	if len(segments) == 0 {
		return fmt.Errorf("no segments to export")
	}

	e.reportProgress(0.0)

	if len(segments) == 1 {
		return e.exportSingleSegment(segments[0], outputPath)
	}

	return e.exportMultiSegment(segments, outputPath)
}

func (e *SegmentExporter) exportSingleSegment(seg Segment, outputPath string) error {
	escapedPath := escapeFilePath(e.sourcePath)
	escapedOutput := escapeFilePath(outputPath)

	pipelineStr := fmt.Sprintf(
		"filesrc location=%s ! decodebin name=dec "+
			"dec. ! queue ! videoconvert ! x264enc ! queue ! "+
			"matroskamux name=mux ! filesink location=%s "+
			"dec. ! queue ! audioconvert ! avenc_aac ! queue ! mux.",
		escapedPath,
		escapedOutput,
	)

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return fmt.Errorf("failed to parse pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return fmt.Errorf("element is not a pipeline")
	}

	// Seek to start position
	const nanosecondsPerSecond = 1_000_000_000
	startNs := int64(seg.StartTime * nanosecondsPerSecond)
	stopNs := int64(seg.EndTime * nanosecondsPerSecond)

	// Set to paused to allow seeking
	pipeline.SetState(gst.StatePaused)
	pipeline.SeekSimple(gst.FormatTime, gst.SeekFlagFlush, startNs)

	// Set up bus watcher
	bus := pipeline.Bus()
	if bus == nil {
		return fmt.Errorf("failed to get bus")
	}
	bus.AddSignalWatch()

	done := make(chan error, 1)

	bus.Connect("message", func(bus *gst.Bus, msg *gst.Message) {
		switch msg.Type() {
		case gst.MessageEos:
			e.reportProgress(1.0)
			done <- nil
		case gst.MessageError:
			err, debug := msg.ParseError()
			done <- fmt.Errorf("GStreamer error: %s (debug: %s)", err, debug)
		case gst.MessageAsyncDone:
			// Check position after async seek completes
			pos, ok := pipeline.QueryPosition(gst.FormatTime)
			if ok && pos >= stopNs {
				pipeline.SetState(gst.StateNull)
				e.reportProgress(1.0)
				done <- nil
			}
		}
	})

	// Start playback
	ret := pipeline.SetState(gst.StatePlaying)
	if ret == gst.StateChangeFailure {
		return fmt.Errorf("failed to start export pipeline")
	}

	err = <-done
	pipeline.SetState(gst.StateNull)
	return err
}

func (e *SegmentExporter) exportMultiSegment(segments []Segment, outputPath string) error {
	tempDir, err := os.MkdirTemp("", "verbal-export-*")
	if err != nil {
		return fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tempDir)

	// Export each segment to a temp file
	var tempFiles []string
	for i, seg := range segments {
		tempFile := filepath.Join(tempDir, fmt.Sprintf("segment_%d.mkv", i))
		tempFiles = append(tempFiles, tempFile)

		if err := e.exportSingleSegment(seg, tempFile); err != nil {
			// Clean up temp files on error
			for _, f := range tempFiles {
				os.Remove(f)
			}
			return fmt.Errorf("failed to export segment %d: %w", i, err)
		}

		// Report progress (90% for segments, 10% for concat)
		progress := float64(i+1) / float64(len(segments)) * 0.9
		e.reportProgress(progress)
	}

	// Concatenate temp files
	if err := e.concatFiles(tempFiles, outputPath); err != nil {
		return fmt.Errorf("failed to concatenate segments: %w", err)
	}

	e.reportProgress(1.0)
	return nil
}

func (e *SegmentExporter) concatFiles(inputFiles []string, outputPath string) error {
	// Build concat pipeline using matroskamux
	var inputs []string
	for _, f := range inputFiles {
		inputs = append(inputs, fmt.Sprintf("filesrc location=%s ! matroskademux name=demux%d demux%d. ! queue ! mux.", escapeFilePath(f), len(inputs), len(inputs)))
	}

	concatStr := fmt.Sprintf(
		"matroskamux name=mux ! filesink location=%s %s",
		escapeFilePath(outputPath),
		strings.Join(inputs, " "),
	)

	return e.runPipeline(concatStr)
}

func (e *SegmentExporter) runPipeline(pipelineStr string) error {
	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return fmt.Errorf("failed to parse pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return fmt.Errorf("element is not a pipeline")
	}

	bus := pipeline.Bus()
	if bus != nil {
		bus.AddSignalWatch()
	}

	done := make(chan error, 1)
	if bus != nil {
		bus.Connect("message", func(bus *gst.Bus, msg *gst.Message) {
			switch msg.Type() {
			case gst.MessageEos:
				done <- nil
			case gst.MessageError:
				err, debug := msg.ParseError()
				done <- fmt.Errorf("GStreamer error: %s (debug: %s)", err, debug)
			}
		})
	}

	ret := pipeline.SetState(gst.StatePlaying)
	if ret == gst.StateChangeFailure {
		return fmt.Errorf("failed to start pipeline")
	}

	err = <-done
	pipeline.SetState(gst.StateNull)
	return err
}

func (e *SegmentExporter) reportProgress(percent float64) {
	e.mu.Lock()
	handler := e.onProgress
	e.mu.Unlock()
	if handler != nil {
		handler(percent)
	}
}

// escapeFilePath escapes a file path for use in GStreamer pipeline strings.
func escapeFilePath(path string) string {
	// GStreamer requires file paths to be escaped for special characters
	// Simple approach: wrap in quotes if path contains spaces
	if strings.Contains(path, " ") {
		return fmt.Sprintf("\"%s\"", path)
	}
	return path
}
