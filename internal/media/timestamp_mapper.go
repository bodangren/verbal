package media

type TimestampMapper struct {
	segments []Segment
	offsets  []float64
}

func NewTimestampMapper(segments []Segment) *TimestampMapper {
	tm := &TimestampMapper{
		segments: segments,
		offsets:  make([]float64, len(segments)),
	}
	tm.computeOffsets()
	return tm
}

func (tm *TimestampMapper) computeOffsets() {
	var cumulative float64
	for i, seg := range tm.segments {
		tm.offsets[i] = cumulative
		cumulative += seg.EndTime - seg.StartTime
	}
}

func (tm *TimestampMapper) OffsetForSegment(segmentIndex int) float64 {
	if segmentIndex < 0 || segmentIndex >= len(tm.offsets) {
		return 0
	}
	return tm.offsets[segmentIndex]
}

func (tm *TimestampMapper) GlobalTime(segmentIndex int, localTime float64) float64 {
	return localTime + tm.OffsetForSegment(segmentIndex)
}

func (tm *TimestampMapper) LocalTime(segmentIndex int, globalTime float64) float64 {
	return globalTime - tm.OffsetForSegment(segmentIndex)
}

func (tm *TimestampMapper) TotalDuration() float64 {
	if len(tm.segments) == 0 {
		return 0
	}
	lastIdx := len(tm.segments) - 1
	return tm.offsets[lastIdx] + (tm.segments[lastIdx].EndTime - tm.segments[lastIdx].StartTime)
}

func (tm *TimestampMapper) SegmentIndexForGlobalTime(globalTime float64) int {
	for i := len(tm.segments) - 1; i >= 0; i-- {
		if globalTime >= tm.offsets[i] {
			return i
		}
	}
	return 0
}
