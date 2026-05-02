# Media Package Test Coverage - Implementation Plan

## Phase 1: Foundation - Devices and Codec Coverage
- [ ] Add tests for Device struct and getDeviceName (devices.go:139, 174)
- [ ] Add tests for GetDefaultVideoDevice (devices.go:139)
- [ ] Add tests for GetDefaultAudioDevice (devices.go:152)
- [ ] Add tests for HasVideoDevice (devices.go:169)
- [ ] Add tests for GstCodecDetector.Detect with mock pipeline (codec.go:76)
- [ ] Add tests for DetectCodecInfo convenience function (codec.go:137)
- [ ] Verify tests pass
- [ ] Run build

## Phase 2: Integration - Export and Pipeline Coverage
- [ ] Add tests for SegmentExporter.DetectCodec with mock detector (export.go:62)
- [ ] Add tests for ExportWithCodecDetection (export.go:97)
- [ ] Add tests for SegmentExporter.export with empty segments (export.go:128)
- [ ] Add tests for exportSingleSegment branch coverage (export.go:142)
- [ ] Add tests for concatFiles (export.go:326)
- [ ] Add tests for runPipeline (export.go:342)
- [ ] Add tests for NewUnifiedPipeline construction (pipeline.go:20)
- [ ] Add tests for Pipeline.Start/Stop/State (pipeline.go:87, 94, 141)
- [ ] Add tests for Pipeline.StartRecording/StopRecording (pipeline.go:101, 121)
- [ ] Add tests for Pipeline.IsRecording/UsesHardware/OutputPath (pipeline.go:147, 153, 157)
- [ ] Verify full suite passes

## Phase 3: Polish
- [ ] Run go vet
- [ ] Update tech-debt.md with codec detector insight
- [ ] Update lessons-learned.md with media testing patterns
- [ ] Final verification
- [ ] Commit and push