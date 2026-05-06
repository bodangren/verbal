# Plan: Offline Local Transcription

**Status:** IN PHASE 5 (Finalization)
**Created:** 2026-05-06
**Focus:** Implement whisper.cpp-based local transcription to replace cloud AI providers for offline-first capability.

---

## Phase 1: Provider Interface & Model Management

- [x] Create `internal/ai/local/` package with Whisper provider implementation
- [x] Write failing tests for `LocalProvider` struct with mock whisper bindings
- [x] Implement `LocalProvider` satisfying `ai.Provider` interface (Name, Transcribe)
- [x] Add `ModelManager` for downloading/verifying ggml model files
- [x] Write tests for model path validation and file existence checks
- [x] Run tests and verify pass

## Phase 2: Settings Integration

- [x] Add `LocalModelConfig` to settings package (model path, model size)
- [x] Write tests for LocalModelConfig serialization
- [x] Update ProviderFactory to create LocalProvider from config
- [x] Add UI selection in settings window for local vs cloud providers
- [x] Run tests and verify pass

## Phase 3: Transcription Service Integration

- [x] Wire LocalProvider into transcription Service
- [x] Write tests for local transcription workflow (no network calls)
- [x] Add progress reporting for whisper.cpp stages (loading, inference)
- [x] Verify fallback to cloud when local fails
- [x] Run tests and verify pass

## Phase 4: UI Polish & Error Handling

- [x] Add model download UI progress (if model not present)
- [x] Write failing tests for error scenarios (missing model, invalid model)
- [x] Implement user-friendly error messages
- [x] Add "Download Model" button/link to settings
- [x] Run full test suite

## Phase 5: Finalization

- [ ] Run `make go-check` for full validation
- [ ] Update `tech-debt.md` with insights
- [ ] Update `lessons-learned.md` with patterns discovered
- [ ] Commit and push changes