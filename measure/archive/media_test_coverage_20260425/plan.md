# Media Package Test Coverage - Implementation Plan

## Phase 1: Foundation - Devices and Codec Coverage
- [x] Add tests for Device struct and getDeviceName (devices.go:139, 174)
- [x] Add tests for GetDefaultVideoDevice (devices.go:139)
- [x] Add tests for GetDefaultAudioDevice (devices.go:152)
- [x] Add tests for HasVideoDevice (devices.go:169)
- [x] Add tests for GstCodecDetector.Detect with mock pipeline (codec.go:76)
- [x] Add tests for DetectCodecInfo convenience function (codec.go:137)
- [x] Verify tests pass
- [x] Run build

## Phase 2: Integration - Export and Pipeline Coverage
- [x] Add tests for SegmentExporter.DetectCodec with mock detector (export.go:62)
- [x] Add tests for ExportWithCodecDetection (export.go:97)
- [x] Add tests for SegmentExporter.export with empty segments (export.go:128)
- [x] Add tests for exportSingleSegment branch coverage (export.go:142)
- [x] Add tests for concatFiles (export.go:326)
- [x] Add tests for runPipeline (export.go:342)
- [ ] Add tests for NewUnifiedPipeline construction (pipeline.go:20)
- [ ] Add tests for Pipeline.Start/Stop/State (pipeline.go:87, 94, 141)
- [ ] Add tests for Pipeline.StartRecording/StopRecording (pipeline.go:101, 121)
- [ ] Add tests for Pipeline.IsRecording/UsesHardware/OutputPath (pipeline.go:147, 153, 157)
- [x] Verify full suite passes

## Phase 3: Polish
- [x] Run go vet
- [x] Update tech-debt.md with codec detector insight
- [x] Update lessons-learned.md with media testing patterns
- [x] Final verification
- [x] Commit and push