# Specification: Offline Local Transcription

**Track:** Feature - Offline Local Transcription
**Created:** 2026-05-06
**Focus:** Implement whisper.cpp-based local transcription to replace cloud AI providers for offline-first capability.

## Vision

Verbal's AI-powered editing should work without internet connectivity. Users should be able to select a local Whisper model that runs entirely on-device, providing:
- Complete privacy (audio never leaves the machine)
- Offline capability
- No API costs or rate limits
- Fast transcription after initial model download

## Technical Approach

### whisper.cpp Integration
- Use `github.com/ggerganov/whisper.cpp/bindings/go` for Go bindings
- Download model files (ggml format) on first use or pre-configure path
- Support multiple model sizes: tiny (39MB), base (74MB), small (242MB), medium (742MB), large (1.5GB)
- Use CPU inference by default; optional GPU acceleration via CUDA/OpenCL

### Provider Interface
- Add new `LocalProvider` implementation satisfying `ai.Provider` interface
- Factory creates local provider when selected in settings
- Progress callback support for transcription progress
- Audio preprocessing (16kHz mono WAV) still handled by transcription service

### Model Management
- Settings UI for model selection and download
- Store model path in settings database
- Validate model file exists before transcription

### Fallback Behavior
- If local provider fails, fall back to cloud providers
- Clear error messaging when model file missing or invalid

## Acceptance Criteria

1. [ ] Local Whisper provider implements `ai.Provider` interface
2. [ ] Settings UI allows model path selection
3. [ ] Transcription works completely offline after model downloaded
4. [ ] Progress callbacks report transcription state
5. [ ] All existing tests pass with new provider option
6. [ ] Memory files updated with findings