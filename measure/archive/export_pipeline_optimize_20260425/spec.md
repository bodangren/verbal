# Export Pipeline Optimization

## Overview
Optimize media export to use stream-copy instead of re-encoding when source codec parameters match the desired output format. This provides faster, lossless export.

## Problem Statement
Current `SegmentExporter` in `internal/media/export.go` uses `x264enc` + `avenc_aac` which decodes and re-encodes video/audio. This is:
- Slower (full encode/decode cycle)
- Lower quality (generation loss)
- Wastes CPU cycles

Stream copy (using GStreamer's `identity` element) passes through codec parameters directly when source and output formats match.

## Functional Requirements

### Phase 1: Analysis and Detection
- [ ] Create a `CodecDetector` interface to inspect source media codec parameters
- [ ] Implement `GstCodecDetector` using GStreamer probe to extract:
  - Video codec (h264, h265, vp9, etc.)
  - Audio codec (aac, mp3, opus, etc.)
  - Container format (mkv, mp4, webm, etc.)
- [ ] Write unit tests for codec detection with mock pipelines

### Phase 2: Stream-Copy Export
- [ ] Modify `SegmentExporter` to accept codec detection result
- [ ] Implement `exportSingleSegmentStreamCopy()` using `queue ! identity !` for passthrough
- [ ] Fall back to re-encoding when codec mismatch detected
- [ ] Write integration tests for stream-copy path

### Phase 3: Concatenation with Stream Copy
- [ ] Modify `concatFiles()` to handle mixed stream-copy and re-encoded segments
- [ ] When all segments use same codec: use `streamrouter` or `funnel` for efficient concat
- [ ] When segments differ: fall back to full re-encode + mux

## Non-Functional Requirements
- Backward compatible: existing export behavior is the fallback
- No breaking changes to public API
- Test coverage >80% for new code paths

## Acceptance Criteria
- [ ] `SegmentExporter` can export single segment using stream copy when codec matches
- [ ] Multi-segment export uses stream-copy when all segments compatible
- [ ] Automatic fallback to re-encoding when stream copy not possible
- [ ] All existing tests pass
- [ ] New tests achieve >80% coverage on `export.go`