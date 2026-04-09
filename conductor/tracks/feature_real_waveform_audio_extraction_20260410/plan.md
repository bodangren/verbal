# Implementation Plan: Real Audio Waveform Extraction

## Phase 1: Foundation and Testing Infrastructure

### Task 1.1: Create Audio Extractor Interface and Tests
- [ ] Define `AudioExtractor` interface with `Extract(filePath string) ([]float64, error)` method
- [ ] Write unit tests for the interface contract
- [ ] Create mock implementation for testing

### Task 1.2: Create GStreamer Appsink Extractor Structure
- [ ] Create `gstreamer_extractor.go` with `GStreamerExtractor` struct
- [ ] Implement pipeline construction with appsink
- [ ] Add pipeline state management (NULL → READY → PAUSED → PLAYING)
- [ ] Write tests for pipeline construction (mock GStreamer where possible)

### Task 1.3: Implement Audio Buffer Processing
- [ ] Handle appsink `new-sample` signal/buffer capture
- [ ] Convert 16-bit PCM to float64 amplitude values
- [ ] Handle mono/stereo conversion
- [ ] Write unit tests for buffer conversion logic

## Phase 2: Integration and Real Extraction

### Task 2.1: Integrate Real Extraction into Generator
- [ ] Replace `extractAudioSamples` synthetic implementation with GStreamer call
- [ ] Update `Generate` method to use real extraction
- [ ] Ensure proper error propagation
- [ ] Update existing generator tests for new behavior

### Task 2.2: Handle Edge Cases and Error Scenarios
- [ ] Handle files without audio tracks (return empty samples or error)
- [ ] Handle unsupported formats gracefully
- [ ] Add timeout for extraction operations
- [ ] Write tests for edge cases

### Task 2.3: Performance and Memory Optimization
- [ ] Implement chunked processing for large files
- [ ] Add progress reporting during extraction
- [ ] Ensure proper pipeline cleanup (SetState NULL)
- [ ] Profile memory usage with large files

## Phase 3: Verification and Documentation

### Task 3.1: Verification and Test Coverage
- [ ] Run full test suite: `go test ./internal/waveform/... -v`
- [ ] Verify >80% code coverage: `go test -cover ./internal/waveform/...`
- [ ] Run integration tests with sample media files
- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)

### Task 3.2: Documentation and Tech Debt Update
- [ ] Update package documentation (GoDoc)
- [ ] Add implementation notes to plan.md
- [ ] Mark tech-debt item as resolved
- [ ] Update lessons-learned.md with GStreamer appsink patterns

### Task 3.3: Final Verification and Checkpoint
- [ ] Run full project build: `go build ./...`
- [ ] Verify no linting errors: `go vet ./...`
- [ ] Commit all changes with proper messages
- [ ] Update track metadata with actual task count

---

## Implementation Notes

### GStreamer Pipeline Design

The extraction pipeline should follow this structure:
```
filesrc location=<file> ! decodebin ! audioconvert ! audioresample ! 
audio/x-raw,format=S16LE,channels=1,rate=16000 ! appsink name=sink
```

Key elements:
- `decodebin`: Auto-detects and decodes various formats
- `audioconvert`: Converts to consistent format
- `audioresample`: Resamples to 16kHz
- `appsink`: Captures raw audio buffers

### Progress Reporting

Progress can be estimated by:
1. Querying total file duration (already implemented)
2. Tracking processed samples vs expected total
3. Or using GStreamer's position queries

### Error Handling Strategy

1. Pipeline creation failures → Return error
2. Missing audio track → Return empty samples (valid, silent waveform)
3. Timeout → Cancel and return error
4. Format errors → Return descriptive error

### Testing Strategy

Since GStreamer requires a display/audio system:
- Unit tests should mock GStreamer where possible
- Integration tests check for DISPLAY/WAYLAND_DISPLAY and skip if unavailable
- Create small test audio files for validation
