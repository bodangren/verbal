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
- [x] Task: Implement horizontal scrolling
  - [x] Write tests for scroll offset calculation
  - [x] Add scrollbar or scroll gesture handling
  - [x] Test scroll behavior with large files

- [x] Task: Implement zoom in/out
  - [x] Write tests for zoom level calculations
  - [x] Add zoom controls (buttons or gestures)
  - [x] Test zoom with various file lengths

- [x] Task: Add time range selection
  - [x] Write tests for selection logic
  - [x] Implement drag-to-select interaction
  - [x] Test selection accuracy

- [x] Task: Conductor - Phase 4 Verification [973e198]

---

## Phase 5: Polish and Testing
**Goal:** Finalize UI polish, performance optimization, and comprehensive testing

### Tasks
- [x] Task: Add hover tooltips with timestamps
  - [x] Write tests for timestamp calculation
  - [x] Implement mouse motion tracking
  - [x] Test tooltip accuracy

- [x] Task: Optimize performance for large files
  - [x] Profile memory usage with 1+ hour files
  - [x] Implement viewport-based rendering optimization
  - [x] Test with edge case file sizes

- [x] Task: Ensure dark theme compatibility
  - [x] Add CSS classes for waveform styling
  - [x] Test with GNOME light and dark themes
  - [x] Verify WCAG contrast compliance

- [x] Task: Write integration tests
  - [x] Test end-to-end workflow
  - [x] Test error handling (corrupt audio, missing files)
  - [x] Note: GTK tests require display; coverage measured when display available

- [x] Task: Conductor - Phase 5 Verification [8f8c359]

---

## Task Summary
- Total Phases: 5
- Estimated Tasks: 19 (plus 5 verification tasks)
- Target Coverage: >80%
