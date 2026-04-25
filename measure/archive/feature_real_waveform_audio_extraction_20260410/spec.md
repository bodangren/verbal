# Specification: Real Audio Waveform Extraction

## Overview

Replace the synthetic waveform data generation in `internal/waveform/generator.go` with real audio amplitude extraction using GStreamer's appsink element. This will provide accurate waveform visualizations that reflect the actual audio content of media files.

## Background

The current implementation in `extractAudioSamples()` generates synthetic placeholder data based on duration. While this allowed rapid prototyping of the waveform visualization UI, it does not provide value to users who need to see actual audio patterns for editing decisions.

## Functional Requirements

### 1. GStreamer Audio Extraction Pipeline
- Create a GStreamer pipeline that extracts raw audio samples from media files
- Use `appsink` element to capture audio buffers in the application
- Support common audio/video formats (MP4, WebM, WAV, MP3, OGG)
- Extract audio in a consistent format (16-bit signed integer, mono, 16kHz)

### 2. Amplitude Calculation
- Convert raw audio samples to amplitude values (0.0-1.0 range)
- Handle both positive and negative sample values correctly
- Apply appropriate scaling for visualization
- Support both mono and stereo source audio (convert to mono for analysis)

### 3. Error Handling
- Gracefully handle files without audio tracks
- Provide meaningful error messages for unsupported formats
- Handle GStreamer pipeline failures with proper cleanup
- Fall back to existing synthetic generation only for truly unrecoverable errors

### 4. Performance Considerations
- Process audio in chunks to avoid memory issues with large files
- Maintain async generation pattern with progress callbacks
- Allow cancellation of in-progress extraction

## Non-Functional Requirements

### Quality
- Maintain >80% test coverage for the extraction logic
- Preserve existing normalization and downsampling behavior
- Ensure waveform visualizations are visually comparable to industry standards

### Compatibility
- Works with existing waveform cache system
- No breaking changes to public Generator API
- Compatible with existing UI components

## Acceptance Criteria

- [ ] Real audio samples are extracted from media files using GStreamer appsink
- [ ] Extracted waveforms accurately represent the audio content
- [ ] All existing tests pass with real extraction (or updated to match new behavior)
- [ ] New tests cover audio extraction pipeline success and failure cases
- [ ] Files without audio tracks are handled gracefully
- [ ] Performance is acceptable for files up to 1 hour duration
- [ ] Memory usage remains reasonable for large files

## Out of Scope

- Real-time waveform generation during recording
- Multi-track audio visualization
- Frequency spectrum analysis (FFT)
- Audio format conversion beyond mono 16kHz
- GPU acceleration for extraction

## Related Tech Debt

From `tech-debt.md`:
- **Waveform generation uses synthetic data** - Current implementation generates synthetic waveform samples. Full implementation should extract actual audio data using GStreamer appsink. [severity: low] - **THIS TRACK ADDRESSES THIS ITEM**
