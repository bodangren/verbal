package edit

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type SegmentEditor interface {
	ApplyEdit(segment MediaSegment, outputPath string) error
	ApplyEdits(segments []MediaSegment, outputPath string) error
}

type MediaSegment struct {
	SourcePath string
	StartTime  float64
	EndTime    float64
	OutputPath string
}

type GstSegmentEditor struct {
	codecInfo MediaCodecInfo
}

type MediaCodecInfo struct {
	VideoCodec string
	AudioCodec string
	Container  string
}

func (c MediaCodecInfo) CanStreamCopy() bool {
	codecs := map[string]bool{
		"H264": true, "H265": true, "VP8": true, "VP9": true,
	}
	return codecs[c.VideoCodec]
}

func NewGstSegmentEditor() *GstSegmentEditor {
	return &GstSegmentEditor{}
}

func (e *GstSegmentEditor) ApplyEdit(segment MediaSegment, outputPath string) error {
	return e.exportSegment(segment, outputPath)
}

func (e *GstSegmentEditor) ApplyEdits(segments []MediaSegment, outputPath string) error {
	if len(segments) == 0 {
		return fmt.Errorf("no segments to export")
	}

	if len(segments) == 1 {
		return e.exportSegment(segments[0], outputPath)
	}

	tempDir, err := os.MkdirTemp("", "verbal-edit-*")
	if err != nil {
		return fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tempDir)

	var tempFiles []string
	for i, seg := range segments {
		tempFile := filepath.Join(tempDir, fmt.Sprintf("segment_%d.mkv", i))
		tempFiles = append(tempFiles, tempFile)
		if err := e.exportSegment(seg, tempFile); err != nil {
			for _, f := range tempFiles {
				os.Remove(f)
			}
			return fmt.Errorf("failed to export segment %d: %w", i, err)
		}
	}

	return e.concatFiles(tempFiles, outputPath)
}

func (e *GstSegmentEditor) exportSegment(seg MediaSegment, outputPath string) error {
	escapedPath := escapeFilePath(seg.SourcePath)
	escapedOutput := escapeFilePath(outputPath)

	startNs := int64(seg.StartTime * float64(time.Second))
	endNs := int64(seg.EndTime * float64(time.Second))

	pipelineStr := fmt.Sprintf(
		"filesrc location=%s ! qtdemux name=demux "+
			"demux. ! queue ! identity ! queue ! matroskamux name=mux ! filesink location=%s "+
			"demux. ! queue ! identity ! queue ! mux.",
		escapedPath,
		escapedOutput,
	)
	_ = startNs
	_ = endNs

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "gst-launch-1.0", "-f", pipelineStr)
	cmd.Wait()

	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("export timed out")
	}

	return nil
}

func (e *GstSegmentEditor) concatFiles(inputFiles []string, outputPath string) error {
	var inputs []string
	for i, f := range inputFiles {
		inputs = append(inputs, fmt.Sprintf("filesrc location=%s ! matroskademux name=demux%d demux%d. ! queue ! mux.", escapeFilePath(f), i, i))
	}

	concatStr := fmt.Sprintf(
		"matroskamux name=mux ! filesink location=%s %s",
		escapeFilePath(outputPath),
		strings.Join(inputs, " "),
	)

	ctx, cancel := context.WithTimeout(context.Background(), 600*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "gst-launch-1.0", "-f", concatStr)
	cmd.Wait()

	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("concat timed out")
	}

	return nil
}

func escapeFilePath(path string) string {
	sanitized := strings.ReplaceAll(path, "\n", "")
	sanitized = strings.ReplaceAll(sanitized, "\r", "")
	return strconv.Quote(sanitized)
}

var _ SegmentEditor = (*GstSegmentEditor)(nil)
