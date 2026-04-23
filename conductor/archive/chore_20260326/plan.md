# Plan: Chore - Hardware Recording Integration

## Objective
Refactor recording pipeline to use real hardware (webcam/mic) with graceful fallback to test sources when hardware is unavailable.

## Phase 1: Device Detection [x] Completed
- [x] Create `internal/media/devices.go` with device enumeration functions
- [x] Implement webcam detection via v4l2 (check /dev/video* devices)
- [x] Implement microphone detection via PulseAudio
- [x] Add tests for device detection logic

## Phase 2: Hardware Pipeline Refactor [x] Completed
- [x] Update `RecordingPipeline` to accept source configuration
- [x] Add `NewHardwareRecordingPipeline()` using v4l2src + pulsesrc
- [x] Implement fallback to test sources when hardware unavailable
- [x] Update main.go to use hardware sources with fallback

## Phase 3: Preview Pipeline Update [x] Completed
- [x] Update `NewPreviewPipeline()` to optionally use real webcam
- [x] Add `NewHardwarePreviewPipeline()` for real device preview
- [x] Add status indication for hardware vs test source

## Phase 4: Verification [x] Completed
- [x] Run all tests: `go test ./...`
- [x] Verify build compiles: `go build ./...`
- [x] Update tech-debt.md with resolved items
