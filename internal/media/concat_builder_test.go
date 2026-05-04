package media

import (
	"testing"
)

func TestSegmentConcatBuilder_BuildStreamCopyPipeline(t *testing.T) {
	segments := []Segment{
		{StartTime: 0.0, EndTime: 10.0, OutputPath: "out1.mkv"},
		{StartTime: 15.0, EndTime: 25.0, OutputPath: "out2.mkv"},
	}
	builder := NewSegmentConcatBuilder("/path/to/source.mp4", segments, true)

	pipeline, err := builder.BuildConcatPipeline("/path/to/output.mkv")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if pipeline == "" {
		t.Error("expected non-empty pipeline")
	}
}

func TestSegmentConcatBuilder_BuildReencodePipeline(t *testing.T) {
	segments := []Segment{
		{StartTime: 0.0, EndTime: 10.0, OutputPath: "out1.mkv"},
	}
	builder := NewSegmentConcatBuilder("/path/to/source.mp4", segments, false)

	pipeline, err := builder.BuildConcatPipeline("/path/to/output.mkv")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if pipeline == "" {
		t.Error("expected non-empty pipeline")
	}
}

func TestSegmentConcatBuilder_TimestampMapper(t *testing.T) {
	segments := []Segment{
		{StartTime: 0.0, EndTime: 10.0, OutputPath: "out1.mkv"},
		{StartTime: 15.0, EndTime: 25.0, OutputPath: "out2.mkv"},
	}
	builder := NewSegmentConcatBuilder("/path/to/source.mp4", segments, true)

	tm := builder.TimestampMapper()
	if tm == nil {
		t.Error("expected non-nil TimestampMapper")
	}

	if offset := tm.OffsetForSegment(1); offset != 10.0 {
		t.Errorf("expected offset 10.0 for segment 1, got %f", offset)
	}
}
