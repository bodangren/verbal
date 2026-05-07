# Plan: Real-time Transcription Stream

**Status:** IN PHASE 1  
**Created:** 2026-05-07  
**Focus:** Transition from file-based transcription to real-time GStreamer app-sink streaming for live captioning during recording.

---

## Phase 1: RealtimeTranscriber Package

- [x] Create `internal/ai/realtime/` package with `Transcriber` interface
- [x] Write failing tests for `Transcriber` struct with mock audio source
- [x] Implement `Start()`, `Stop()`, `OnWordCallback()` methods
- [x] Add thread-safe state management (Ready, Streaming, Stopped, Error)
- [x] Run tests and verify pass

## Phase 2: GStreamer Pipeline with Appsink

- [x] Create `GstTranscriber` implementing `Transcriber` with GStreamer pipeline
- [x] Write failing tests for pipeline creation (handle missing display)
- [x] Implement `pulsesrc ! queue ! appsink` pipeline setup
- [x] Add audio format negotiation (S16LE, 16kHz, mono)
- [x] Handle buffer callbacks from appsink
- [x] Run tests and verify pass

## Phase 3: Provider Streaming

- [x] Add `StreamingProvider` sub-interface in `internal/ai/realtime/`
- [x] Implement `StreamingConfig` and `StreamingSession` interfaces
- [x] Write tests for chunk streaming
- [x] Run tests and verify pass

## Phase 4: Live Caption Widget

- [x] Create `LiveCaptionWidget` in `internal/ui/`
- [x] Write tests for widget construction
- [x] Implement word-by-word display with animation
- [x] Add confidence indicator styling
- [x] Implement minimize/dismiss functionality
- [x] Run tests and verify pass

## Phase 5: Recording Integration & Finalization

- [x] Add `StartRealtimeTranscription()` method to `media.Recording`
- [x] Implement `RecordingTranscriber` with `Start/Stop/ProcessAudioChunk`
- [x] Write integration tests for recording flow
- [x] Run tests and verify pass
- [ ] Run full test suite: `go test ./internal/ai/...`
- [ ] Update `tech-debt.md` and `lessons-learned.md`
- [ ] Commit and push changes