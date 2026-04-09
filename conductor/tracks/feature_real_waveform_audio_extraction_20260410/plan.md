# Implementation Plan: Real Audio Waveform Extraction

## Phase 1: Foundation and Testing Infrastructure [checkpoint: a84d3b8]

### Task 1.1: Create Audio Extractor Interface and Tests
- [x] Define `AudioExtractor` interface with `Extract(filePath string) ([]float64, error)` method [commit: 8b60e3c]
- [x] Write unit tests for the interface contract [commit: 8b60e3c]
- [x] Create mock implementation for testing [commit: 8b60e3c]

### Task 1.2: Create GStreamer Extractor Structure
- [x] Create `gstreamer_extractor.go` with `GStreamerExtractor` struct [commit: 8b60e3c]
- [x] Implement pipeline construction using gst-launch-1.0 (appsink not available in gotk4-gstreamer) [commit: 8b60e3c]
- [x] Add extraction with timeout support [commit: 8b60e3c]
- [x] Write tests for extraction and conversion logic [commit: 8b60e3c]

### Task 1.3: Implement Audio Buffer Processing
- [x] Convert 16-bit PCM to float64 amplitude values [commit: 8b60e3c]
- [x] Handle mono/stereo conversion via audioconvert element [commit: 8b60e3c]
- [x] Write unit tests for buffer conversion logic [commit: 8b60e3c]

## Phase 2: Integration and Real Extraction

### Task 2.1: Integrate Real Extraction into Generator
- [~] Replace `extractAudioSamples` synthetic implementation with GStreamer call
- [~] Update `Generate` method to use real extraction
- [~] Ensure proper error propagation
- [~] Update existing generator tests for new behavior

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
- [ ] Update lessons-learned.md with GStreamer patterns

### Task 3.3: Final Verification and Checkpoint
- [ ] Run full project build: `go build ./...`
- [ ] Verify no linting errors: `go vet ./...`
- [ ] Commit all changes with proper messages
- [ ] Update track metadata with actual task count

---

## Implementation Notes

### GStreamer Pipeline Design

The extraction pipeline uses gst-launch-1.0 command:
```
gst-launch-1.0 filesrc location=<file> ! decodebin ! audioconvert ! 
audioresample ! audio/x-raw,format=S16LE,channels=1,rate=16000 ! 
filesink location=<temp>
```

Key elements:
- `decodebin`: Auto-detects and decodes various formats
- `audioconvert`: Converts to consistent format (mono)
- `audioresample`: Resamples to 16kHz
- Output written to temp file, then read and converted

### Architecture Decisions

1. **Used gst-launch-1.0 instead of appsink**: The gotk4-gstreamer bindings don't expose AppSink type directly. Using gst-launch-1.0 subprocess is a pragmatic workaround that still extracts real audio data.

2. **AudioExtractor Interface**: Created interface for testability and future flexibility (could add FFmpeg backend).

3. **Normalization**: Audio samples are normalized to [0.0, 1.0] range by taking absolute value and dividing by 32768 (max int16).

### Error Handling Strategy

1. Pipeline creation failures → Return error
2. Missing audio track → Return empty samples (valid, silent waveform)
3. Timeout → Cancel and return error
4. Format errors → Return descriptive error

### Testing Strategy

Since GStreamer requires a display/audio system:
- Unit tests mock extractor interface where possible
- Integration tests check for DISPLAY/WAYLAND_DISPLAY and skip if unavailable
- Conversion logic tested independently of GStreamer
