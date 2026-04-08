# Implementation Plan: Waveform Visualization

## Phase 1: Core Waveform Data Generation
**Goal:** Extract and process audio data from video files into waveform samples

### Tasks
- [x] Task: Create WaveformGenerator type with GStreamer pipeline [66cb6ab]
  - [x] Write tests for WaveformGenerator initialization
  - [x] Implement WaveformGenerator with audio extraction pipeline
  - [x] Test with various audio formats

- [x] Task: Implement audio downsampling and amplitude extraction [bdc30b4]
  - [x] Write tests for amplitude calculation from audio samples
  - [x] Implement downsample algorithm (reduce to ~1000 samples per minute)
  - [x] Test downsampling accuracy

- [x] Task: Create WaveformCache for data persistence [bdc30b4]
  - [x] Write tests for cache storage and retrieval
  - [x] Implement SQLite schema for waveform data
  - [x] Test cache hit/miss scenarios

- [x] Task: Conductor - Phase 1 Verification [bdc30b4]

---

## Phase 2: GTK4 Waveform Widget
**Goal:** Create a custom GTK4 widget for waveform visualization

### Tasks
- [x] Task: Create WaveformWidget type extending gtk.DrawingArea
  - [x] Write tests for widget creation and configuration
  - [x] Implement WaveformWidget with Cairo rendering
  - [x] Test widget sizing and allocation

- [x] Task: Implement waveform drawing with Cairo
  - [x] Write tests for drawing functions
  - [x] Implement waveform path rendering (centered, amplitude-based)
  - [x] Test rendering with sample data

- [x] Task: Add playback position indicator
  - [x] Write tests for position calculation
  - [x] Implement vertical line indicator at current position
  - [x] Test position updates during playback

- [x] Task: Add click-to-seek functionality
  - [x] Write tests for coordinate-to-time mapping
  - [x] Implement click handler for seeking
  - [x] Test seek accuracy

- [x] Task: Conductor - Phase 2 Verification

---

## Phase 3: Integration with Playback View
**Goal:** Wire waveform widget into the existing playback window

### Tasks
- [x] Task: Add WaveformWidget to PlaybackWindow layout
  - [x] Write tests for widget integration
  - [x] Modify PlaybackWindow to include waveform above transcription
  - [x] Test layout and sizing

- [x] Task: Wire waveform to PositionMonitor
  - [x] Write tests for position synchronization
  - [x] Implement callback for position updates
  - [x] Test sync at 10fps rate

- [x] Task: Add loading state UI
  - [x] Write tests for loading state transitions
  - [x] Implement progress indicator during generation
  - [x] Test async generation flow

- [x] Task: Conductor - Phase 3 Verification [7566af6]

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
