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

- [ ] Create `LiveCaptionWidget` in `internal/ui/`
- [ ] Write failing tests for widget construction
- [ ] Implement word-by-word display with animation
- [ ] Add confidence indicator styling
- [ ] Implement minimize/dismiss functionality
- [ ] Run UI tests and verify pass

## Phase 5: Recording Integration & Finalization

- [ ] Add `StartRealtimeTranscription()` method to `media.Recording`
- [ ] Wire LiveCaptionWidget into recording view
- [ ] Add keyboard shortcut (Ctrl+Shift+R) for record with live transcription
- [ ] Write integration tests for recording flow
- [ ] Run full test suite: `make go-check`
- [ ] Update `tech-debt.md` and `lessons-learned.md`
- [ ] Commit and push changes