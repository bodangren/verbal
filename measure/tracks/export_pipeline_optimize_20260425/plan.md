# Export Pipeline Optimization - Implementation Plan

## Phase 1: Codec Detection Infrastructure
### Tasks:
- [x] Create `CodecInfo` struct with VideoCodec, AudioCodec, Container fields
- [x] Create `CodecDetector` interface with `Detect(path string) (CodecInfo, error)` method
- [x] Implement `GstCodecDetector` using GStreamer probe pattern
- [x] Write unit tests for CodecInfo and interface
- [x] Verify: all tests pass, build succeeds

## Phase 2: Stream-Copy Export for Single Segment
### Tasks:
- [x] Add `codecInfo` field to `SegmentExporter` struct
- [x] Add `DetectCodec()` method to `SegmentExporter`
- [x] Implement `canStreamCopy(codec CodecInfo) bool` helper
- [x] Implement `exportSingleSegmentStreamCopy()` pipeline using `qtdemux name=demux ! queue ! identity ! queue ! muxer`
- [x] Modify `exportSingleSegment()` to check `canStreamCopy` and use stream-copy path when true
- [x] Write tests for stream-copy detection and fallback (TestSegmentExporter_SetCodecInfo, TestSegmentExporter_canStreamCopy)
- [x] Verify: all tests pass, build succeeds

## Phase 3: Stream-Copy Concatenation
### Tasks:
- [ ] Research GStreamer `funnel` element for stream-copy concatenation (complex timestamp handling)
- [ ] Note: Multi-segment stream-copy concatenation requires precise timestamp rewriting
- [ ] Current multi-segment export remains using re-encode (works reliably)
- [ ] Add detection for whether segments can use stream-copy (all same codec)
- [ ] Document limitations in tech-debt.md
- [ ] Write tests for segment compatibility detection
- [ ] Verify: all tests pass, build succeeds

## Phase 4: Integration and Polish
### Tasks:
- [x] Add `ExportWithCodecDetection()` convenience method that auto-detects before exporting
- [x] Update export flow to use stream-copy by default when available
- [x] Verify full integration with existing UI (ExportDialog)
- [ ] Run smoke test: start dev server, load app, verify no console errors

## Phase 5: Finalization
### Tasks:
- [ ] Run full test suite (`go test ./...`)
- [ ] Run full build (`go build ./...`)
- [ ] Update tech-debt.md: mark "Export pipeline uses re-encoding" as resolved, note stream-copy implementation
- [ ] Update lessons-learned.md with GStreamer stream-copy patterns
- [ ] Commit with git note (include model name), push