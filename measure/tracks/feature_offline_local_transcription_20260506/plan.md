# Plan: Offline Local Transcription

**Status:** PENDING
**Created:** 2026-05-06
**Focus:** Implement whisper.cpp-based local transcription to replace cloud AI providers for offline-first capability.

---

## Phase 1: Provider Interface & Model Management

- [ ] Create `internal/ai/local/` package with Whisper provider implementation
- [ ] Write failing tests for `LocalProvider` struct with mock whisper bindings
- [ ] Implement `LocalProvider` satisfying `ai.Provider` interface (Name, Transcribe)
- [ ] Add `ModelManager` for downloading/verifying ggml model files
- [ ] Write tests for model path validation and file existence checks
- [ ] Run tests and verify pass

## Phase 2: Settings Integration

- [ ] Add `LocalModelConfig` to settings package (model path, model size)
- [ ] Write tests for LocalModelConfig serialization
- [ ] Update ProviderFactory to create LocalProvider from config
- [ ] Add UI selection in settings window for local vs cloud providers
- [ ] Run tests and verify pass

## Phase 3: Transcription Service Integration

- [ ] Wire LocalProvider into transcription Service
- [ ] Write tests for local transcription workflow (no network calls)
- [ ] Add progress reporting for whisper.cpp stages (loading, inference)
- [ ] Verify fallback to cloud when local fails
- [ ] Run tests and verify pass

## Phase 4: UI Polish & Error Handling

- [ ] Add model download UI progress (if model not present)
- [ ] Write failing tests for error scenarios (missing model, invalid model)
- [ ] Implement user-friendly error messages
- [ ] Add "Download Model" button/link to settings
- [ ] Run full test suite

## Phase 5: Finalization

- [ ] Run `make go-check` for full validation
- [ ] Update `tech-debt.md` with insights
- [ ] Update `lessons-learned.md` with patterns discovered
- [ ] Commit and push changes