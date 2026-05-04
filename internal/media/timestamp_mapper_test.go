package media

import (
	"testing"
)

func TestTimestampMapper_SingleSegment(t *testing.T) {
	segments := []Segment{
		{StartTime: 0.0, EndTime: 10.0, OutputPath: "out1.mkv"},
	}
	tm := NewTimestampMapper(segments)

	if offset := tm.OffsetForSegment(0); offset != 0.0 {
		t.Errorf("expected offset 0.0, got %f", offset)
	}

	if global := tm.GlobalTime(0, 5.0); global != 5.0 {
		t.Errorf("expected global time 5.0, got %f", global)
	}

	if local := tm.LocalTime(0, 5.0); local != 5.0 {
		t.Errorf("expected local time 5.0, got %f", local)
	}

	if duration := tm.TotalDuration(); duration != 10.0 {
		t.Errorf("expected duration 10.0, got %f", duration)
	}
}

func TestTimestampMapper_MultipleSegments(t *testing.T) {
	segments := []Segment{
		{StartTime: 0.0, EndTime: 10.0, OutputPath: "out1.mkv"},
		{StartTime: 15.0, EndTime: 25.0, OutputPath: "out2.mkv"},
		{StartTime: 30.0, EndTime: 40.0, OutputPath: "out3.mkv"},
	}
	tm := NewTimestampMapper(segments)

	tests := []struct {
		segIdx     int
		wantOffset float64
	}{
		{0, 0.0},
		{1, 10.0},
		{2, 20.0},
	}

	for _, tc := range tests {
		if offset := tm.OffsetForSegment(tc.segIdx); offset != tc.wantOffset {
			t.Errorf("segment %d: expected offset %f, got %f", tc.segIdx, tc.wantOffset, offset)
		}
	}

	if duration := tm.TotalDuration(); duration != 30.0 {
		t.Errorf("expected total duration 30.0, got %f", duration)
	}
}

func TestTimestampMapper_GlobalToLocal(t *testing.T) {
	segments := []Segment{
		{StartTime: 0.0, EndTime: 10.0, OutputPath: "out1.mkv"},
		{StartTime: 15.0, EndTime: 25.0, OutputPath: "out2.mkv"},
	}
	tm := NewTimestampMapper(segments)

	tests := []struct {
		globalTime  float64
		segIdx      int
		wantLocal   float64
	}{
		{5.0, 0, 5.0},
		{12.0, 0, 12.0},
		{15.0, 1, 5.0},
		{20.0, 1, 10.0},
		{25.0, 1, 15.0},
	}

	for _, tc := range tests {
		local := tm.LocalTime(tc.segIdx, tc.globalTime)
		if local != tc.wantLocal {
			t.Errorf("global %f segment %d: expected local %f, got %f", tc.globalTime, tc.segIdx, tc.wantLocal, local)
		}
	}
}

func TestTimestampMapper_EmptySegments(t *testing.T) {
	var segments []Segment
	tm := NewTimestampMapper(segments)

	if duration := tm.TotalDuration(); duration != 0.0 {
		t.Errorf("expected 0 duration for empty segments, got %f", duration)
	}

	if idx := tm.SegmentIndexForGlobalTime(5.0); idx != 0 {
		t.Errorf("expected segment index 0 for empty, got %d", idx)
	}
}

func TestTimestampMapper_SegmentIndexForGlobalTime(t *testing.T) {
	segments := []Segment{
		{StartTime: 0.0, EndTime: 10.0, OutputPath: "out1.mkv"},
		{StartTime: 15.0, EndTime: 25.0, OutputPath: "out2.mkv"},
		{StartTime: 30.0, EndTime: 40.0, OutputPath: "out3.mkv"},
	}
	tm := NewTimestampMapper(segments)

	tests := []struct {
		globalTime float64
		wantIdx    int
	}{
		{5.0, 0},
		{9.999, 0},
		{10.0, 1},
		{15.0, 1},
		{19.999, 1},
		{20.0, 2},
		{35.0, 2},
	}

	for _, tc := range tests {
		idx := tm.SegmentIndexForGlobalTime(tc.globalTime)
		if idx != tc.wantIdx {
			t.Errorf("global time %f: expected segment %d, got %d", tc.globalTime, tc.wantIdx, idx)
		}
	}
}
