# Plan: MVP Transcription

**Status:** PLANNED  
**Created:** 2026-06-12  
**Focus:** Implement provider-agnostic transcription with OpenAI Whisper and Google Speech-to-Text.

---

## Phase 1: Provider Interface

### Red
- [ ] Write failing tests for `ai.Provider` interface and `ai.Transcript` result.

### Green
- [ ] Define `internal/ai/provider.go` with `Provider` interface.
- [ ] Define `internal/ai/transcript.go` result type.
- [ ] Implement `fakeProvider` for tests.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ai): Add transcription provider interface`

---

## Phase 2: Audio Extraction

### Red
- [ ] Write failing tests for audio extraction: given a media file, produce mono 16kHz PCM.

### Green
- [ ] Implement `internal/transcription/extractor.go` using a GStreamer pipeline.
- [ ] Support context cancellation.
- [ ] Make tests pass using a fixture or mocked runner.

### Refactor
- [ ] Commit: `feat(transcription): Add GStreamer audio extractor`

---

## Phase 3: OpenAI Provider

### Red
- [ ] Write failing tests for OpenAI Whisper response parsing.

### Green
- [ ] Implement `internal/ai/openai.go`.
- [ ] Send audio via HTTP to Whisper API.
- [ ] Request word-level timestamps.
- [ ] Parse response into `domain.Word` slice.
- [ ] Handle API and network errors.
- [ ] Make tests pass with mocked HTTP server.

### Refactor
- [ ] Commit: `feat(ai): Add OpenAI Whisper provider`

---

## Phase 4: Google Provider

### Red
- [ ] Write failing tests for Google Speech-to-Text response parsing.

### Green
- [ ] Implement `internal/ai/google.go`.
- [ ] Send audio via HTTP to Google Speech-to-Text API.
- [ ] Request word-level timestamps.
- [ ] Parse response into `domain.Word` slice.
- [ ] Handle API and network errors.
- [ ] Make tests pass with mocked HTTP server.

### Refactor
- [ ] Commit: `feat(ai): Add Google Speech-to-Text provider`

---

## Phase 5: Transcription Service

### Red
- [ ] Write failing tests for `transcription.Service`: extracts audio, calls provider, persists transcript, updates status.

### Green
- [ ] Implement `internal/transcription/service.go`.
- [ ] Wire extractor, provider factory, and repository.
- [ ] Report progress via callback.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(transcription): Add transcription service`

---

## Phase 6: Settings & UI

### Red
- [ ] Write failing tests for settings storage and provider selection.

### Green
- [ ] Add provider and API key fields to settings repository.
- [ ] Add a simple settings dialog.
- [ ] Add "Transcribe" action to the playback/library view.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ui): Add transcription settings and action`

---

## Phase 7: Final Verification

- [ ] Run `make check`.
- [ ] Manual verification: transcribe a short recording with each provider.
- [ ] Update `measure/tech-debt.md` and `measure/lessons-learned.md` if needed.
- [ ] Update this `plan.md` and `measure/tracks.md`.
- [ ] Commit: `measure(plan): Mark MVP transcription complete`
