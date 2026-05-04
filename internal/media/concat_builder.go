package media

import (
	"fmt"
)

type SegmentConcatBuilder struct {
	tm           *TimestampMapper
	sourcePath   string
	codecInfo    CodecInfo
	canCopy      bool
}

func NewSegmentConcatBuilder(sourcePath string, segments []Segment, canStreamCopy bool) *SegmentConcatBuilder {
	return &SegmentConcatBuilder{
		tm:         NewTimestampMapper(segments),
		sourcePath: sourcePath,
		canCopy:    canStreamCopy,
	}
}

func (b *SegmentConcatBuilder) BuildConcatPipeline(outputPath string) (string, error) {
	if b.canCopy {
		return b.buildStreamCopyPipeline(outputPath)
	}
	return b.buildReencodePipeline(outputPath)
}

func (b *SegmentConcatBuilder) buildStreamCopyPipeline(outputPath string) (string, error) {
	var pipeline string
	pipeline = fmt.Sprintf("filesrc location=%s ! qtdemux name=demux ", QuoteLocation(b.sourcePath))
	pipeline += fmt.Sprintf("demux. ! queue ! identity single-segment=true ! queue ! matroskamux name=mux ! filesink location=%s ", QuoteLocation(outputPath))
	return pipeline, nil
}

func (b *SegmentConcatBuilder) buildReencodePipeline(outputPath string) (string, error) {
	var pipeline string
	pipeline = fmt.Sprintf("filesrc location=%s ! decodebin name=dec ", QuoteLocation(b.sourcePath))
	pipeline += fmt.Sprintf("dec. ! queue ! videoconvert ! x264enc ! queue ! matroskamux name=mux ! filesink location=%s ", QuoteLocation(outputPath))
	return pipeline, nil
}

func (b *SegmentConcatBuilder) TimestampMapper() *TimestampMapper {
	return b.tm
}
