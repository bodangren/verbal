package thumbnail

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

// ErrSeekFailed indicates that a thumbnail extraction pipeline could not seek.
var ErrSeekFailed = errors.New("failed to seek extraction pipeline")

// GStreamerExtractor extracts video frames using GStreamer pipelines.
type GStreamerExtractor struct {
	timeout time.Duration
}

// NewGStreamerExtractor creates a new extractor with the provided timeout.
func NewGStreamerExtractor(timeout time.Duration) *GStreamerExtractor {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &GStreamerExtractor{timeout: timeout}
}

// ProbeDuration determines media duration via a lightweight decode pipeline.
func (e *GStreamerExtractor) ProbeDuration(filePath string) (time.Duration, error) {
	pipelineStr := fmt.Sprintf(
		"filesrc location=%s ! decodebin ! fakesink",
		quoteLocation(filePath),
	)

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return 0, fmt.Errorf("parse duration pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return 0, errors.New("duration pipeline is not a gst pipeline")
	}
	defer pipeline.SetState(gst.StateNull)

	if ret := pipeline.SetState(gst.StatePaused); ret == gst.StateChangeFailure {
		return 0, errors.New("failed to set duration pipeline to paused")
	}

	deadline := time.Now().Add(e.timeout)
	for time.Now().Before(deadline) {
		durationNS, ok := pipeline.QueryDuration(gst.FormatTime)
		if ok && durationNS > 0 {
			return time.Duration(durationNS), nil
		}
		time.Sleep(50 * time.Millisecond)
	}

	return 0, errors.New("timed out probing media duration")
}

// ExtractFrameToFile extracts a single frame as JPEG to outputPath.
func (e *GStreamerExtractor) ExtractFrameToFile(
	filePath string,
	seekPosition time.Duration,
	outputPath string,
	width, height, jpegQuality int,
) error {
	if width <= 0 || height <= 0 {
		return errors.New("thumbnail dimensions must be positive")
	}
	if jpegQuality <= 0 || jpegQuality > 100 {
		return errors.New("jpeg quality must be between 1 and 100")
	}

	_ = os.Remove(outputPath)

	pipelineStr := fmt.Sprintf(
		"filesrc location=%s ! decodebin name=dec "+
			"dec. ! queue ! videoconvert ! videoscale ! "+
			"video/x-raw,width=%d,height=%d,pixel-aspect-ratio=1/1 ! "+
			"jpegenc quality=%d snapshot=true ! filesink location=%s",
		quoteLocation(filePath),
		width,
		height,
		jpegQuality,
		quoteLocation(outputPath),
	)

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return fmt.Errorf("parse extraction pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return errors.New("extraction pipeline is not a gst pipeline")
	}
	defer pipeline.SetState(gst.StateNull)

	if ret := pipeline.SetState(gst.StatePaused); ret == gst.StateChangeFailure {
		return errors.New("failed to set extraction pipeline to paused")
	}

	if seekPosition > 0 {
		if ok := pipeline.SeekSimple(
			gst.FormatTime,
			gst.SeekFlagFlush|gst.SeekFlagKeyUnit,
			seekPosition.Nanoseconds(),
		); !ok {
			return ErrSeekFailed
		}
	}

	bus := pipeline.Bus()
	if bus == nil {
		return errors.New("failed to create extraction bus")
	}

	if ret := pipeline.SetState(gst.StatePlaying); ret == gst.StateChangeFailure {
		return errors.New("failed to start extraction pipeline")
	}

	msg := bus.Poll(gst.MessageError|gst.MessageEos, gst.ClockTime(e.timeout.Nanoseconds()))
	if msg == nil {
		return errors.New("timed out waiting for extraction pipeline")
	}

	if msg.Type() == gst.MessageError {
		gstErr, debug := msg.ParseError()
		return fmt.Errorf("gstreamer extraction error: %v (debug: %s)", gstErr, debug)
	}

	info, err := os.Stat(outputPath)
	if err != nil {
		return fmt.Errorf("thumbnail output missing: %w", err)
	}
	if info.Size() <= 0 {
		return errors.New("thumbnail output file is empty")
	}

	return nil
}

func quoteLocation(path string) string {
	sanitized := strings.ReplaceAll(path, "\n", "")
	sanitized = strings.ReplaceAll(sanitized, "\r", "")
	return strconv.Quote(sanitized)
}

func init() {
	gst.Init()
}
