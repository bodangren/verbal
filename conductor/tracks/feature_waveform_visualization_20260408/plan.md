# Implementation Plan: Waveform Visualization

## Phase 1: Core Waveform Data Generation
**Goal:** Extract and process audio data from video files into waveform samples

### Tasks
- [ ] Task: Create WaveformGenerator type with GStreamer pipeline
  - [ ] Write tests for WaveformGenerator initialization
  - [ ] Implement WaveformGenerator with audio extraction pipeline
  - [ ] Test with various audio formats

- [ ] Task: Implement audio downsampling and amplitude extraction
  - [ ] Write tests for amplitude calculation from audio samples
  - [ ] Implement downsample algorithm (reduce to ~1000 samples per minute)
  - [ ] Test downsampling accuracy

- [ ] Task: Create WaveformCache for data persistence
  - [ ] Write tests for cache storage and retrieval
  - [ ] Implement SQLite schema for waveform data
  - [ ] Test cache hit/miss scenarios

- [ ] Task: Conductor - Phase 1 Verification

---

## Phase 2: GTK4 Waveform Widget
**Goal:** Create a custom GTK4 widget for waveform visualization

### Tasks
- [ ] Task: Create WaveformWidget type extending gtk.DrawingArea
  - [ ] Write tests for widget creation and configuration
  - [ ] Implement WaveformWidget with Cairo rendering
  - [ ] Test widget sizing and allocation

- [ ] Task: Implement waveform drawing with Cairo
  - [ ] Write tests for drawing functions
  - [ ] Implement waveform path rendering (centered, amplitude-based)
  - [ ] Test rendering with sample data

- [ ] Task: Add playback position indicator
  - [ ] Write tests for position calculation
  - [ ] Implement vertical line indicator at current position
  - [ ] Test position updates during playback

- [ ] Task: Add click-to-seek functionality
  - [ ] Write tests for coordinate-to-time mapping
  - [ ] Implement click handler for seeking
  - [ ] Test seek accuracy

- [ ] Task: Conductor - Phase 2 Verification

---

## Phase 3: Integration with Playback View
**Goal:** Wire waveform widget into the existing playback window

### Tasks
- [ ] Task: Add WaveformWidget to PlaybackWindow layout
  - [ ] Write tests for widget integration
  - [ ] Modify PlaybackWindow to include waveform above transcription
  - [ ] Test layout and sizing

- [ ] Task: Wire waveform to PositionMonitor
  - [ ] Write tests for position synchronization
  - [ ] Implement callback for position updates
  - [ ] Test sync at 10fps rate

- [ ] Task: Add loading state UI
  - [ ] Write tests for loading state transitions
  - [ ] Implement progress indicator during generation
  - [ ] Test async generation flow

- [ ] Task: Conductor - Phase 3 Verification

---

## Phase 4: Advanced Features
**Goal:** Add zoom, scroll, and selection capabilities

### Tasks
- [ ] Task: Implement horizontal scrolling
  - [ ] Write tests for scroll offset calculation
  - [ ] Add scrollbar or scroll gesture handling
  - [ ] Test scroll behavior with large files

- [ ] Task: Implement zoom in/out
  - [ ] Write tests for zoom level calculations
  - [ ] Add zoom controls (buttons or gestures)
  - [ ] Test zoom with various file lengths

- [ ] Task: Add time range selection
  - [ ] Write tests for selection logic
  - [ ] Implement drag-to-select interaction
  - [ ] Test selection accuracy

- [ ] Task: Conductor - Phase 4 Verification

---

## Phase 5: Polish and Testing
**Goal:** Finalize UI polish, performance optimization, and comprehensive testing

### Tasks
- [ ] Task: Add hover tooltips with timestamps
  - [ ] Write tests for timestamp calculation
  - [ ] Implement mouse motion tracking
  - [ ] Test tooltip accuracy

- [ ] Task: Optimize performance for large files
  - [ ] Profile memory usage with 1+ hour files
  - [ ] Implement viewport-based rendering optimization
  - [ ] Test with edge case file sizes

- [ ] Task: Ensure dark theme compatibility
  - [ ] Add CSS classes for waveform styling
  - [ ] Test with GNOME light and dark themes
  - [ ] Verify WCAG contrast compliance

- [ ] Task: Write integration tests
  - [ ] Test end-to-end workflow
  - [ ] Test error handling (corrupt audio, missing files)
  - [ ] Verify >80% coverage

- [ ] Task: Conductor - Phase 5 Verification

---

## Task Summary
- Total Phases: 5
- Estimated Tasks: 19 (plus 5 verification tasks)
- Target Coverage: >80%
