# Implementation Plan: Video Playback with Transcription Synchronization

## Status: Phase 1-3 Complete, Phase 4-5 Pending

**Note:** Phases 1-3 completed successfully. Phase 3 includes:
- Position polling via PositionMonitor (10fps, 97.5% test coverage)
- PlaybackPipeline for video playback with position query/seek
- SyncIntegration wiring PositionMonitor → Controller → UI
- Click-to-seek functionality implemented

Phase 4 (main window split-pane layout) and Phase 5 (polish/finalize) remain for next autonomous run.

---

## Phase 1: Core Synchronization Controller ✅
**Goal:** Build the core logic for synchronizing video position with transcription words.

### Tasks

#### 1.1 Define Sync Controller Interface (TDD: Red) ✅
- [x] Create `internal/sync/controller.go` with `SyncController` struct
- [x] Define interface: `OnPositionChanged(position float64)`, `SeekToWord(wordIndex int)`
- [x] Write failing tests for controller initialization and basic operations

**Test Cases:**
- Controller creation with transcription data
- Finding current word index for a given timestamp
- Seeking to specific word index

#### 1.2 Implement Word Lookup Logic (TDD: Green) ✅
- [x] Implement binary search for finding word by timestamp (O(log n))
- [x] Implement `GetCurrentWordIndex(position float64) int`
- [x] Make tests pass

**Test Cases:**
- Lookup at exact word start time
- Lookup between words (returns previous)
- Lookup before first word (returns -1)
- Lookup after last word (returns last index)

#### 1.3 Add Position Tracking (TDD: Green) ✅
- [x] Add position update callback system
- [x] Implement `RegisterPositionCallback(cb func(position float64))`
- [x] Write tests for callback invocation

**Test Cases:**
- Callback registered and invoked on position update
- Multiple callbacks work correctly
- Unregister callback works

#### 1.4 Refactor & Document ✅
- [x] Add comprehensive Go doc comments
- [x] Ensure >80% test coverage for controller (achieved 91.4%)
- [x] Review error handling

---

## Phase 2: Transcription Word Widget ✅
**Goal:** Create clickable, highlightable word widgets for the transcription view.

### Tasks

#### 2.1 Define Word Widget (TDD: Red) ✅
- [x] Create `internal/ui/word_label.go` - clickable word label
- [x] Define signals: `clicked`, `hover-enter`, `hover-leave`
- [x] Write failing tests for widget creation and signals

**Test Cases:**
- Widget creation with word text and timestamp
- Click signal emits correct timestamp
- Hover signals work correctly

#### 2.2 Implement Styling & Highlighting (TDD: Green) ✅
- [x] Add CSS classes for: `word-label`, `word-highlighted`, `word-hover`
- [x] Implement `SetHighlighted(bool)` method
- [x] Make tests pass

**Test Cases:**
- Highlight state change updates CSS class
- Hover state updates CSS class
- Normal state has correct styling

#### 2.3 Create Word Container (TDD: Green) ✅
- [x] Create `internal/ui/word_container.go` - container for words
- [x] FlowLayout for words (wraps like text)
- [x] Add scrollbar support
- [x] Write tests for word management

**Test Cases:**
- Adding words to container
- Finding word widget by index
- Clear and rebuild functionality

#### 2.4 Refactor & Document ✅
- [x] Add Go doc comments
- [x] Ensure >80% test coverage (GTK tests skipped headless, logic tested)
- [x] Review GTK thread safety

---

## Phase 3: Integration with Video Player ✅
**Goal:** Connect sync controller with video widget and transcription view.

### Tasks

#### 3.1 Position Polling (TDD: Red) ✅
- [x] Add position polling from GStreamer pipeline
- [x] Create `internal/media/position_monitor.go`
- [x] Poll at 10fps (100ms interval)
- [x] Write comprehensive tests (10 test cases, all passing)

**Test Cases:**
- ✅ Position updates are emitted at expected rate
- ✅ Monitor starts/stops correctly
- ✅ No updates when pipeline is paused
- ✅ Multiple callbacks supported
- ✅ Unregister callback works
- ✅ Concurrent access safe

#### 3.2 Connect Sync Controller (TDD: Green) ✅
- [x] Create `internal/media/playback.go` with PlaybackPipeline
- [x] Implement QueryPosition and SeekTo for GStreamer
- [x] Create `internal/sync/integration.go` for wiring components
- [x] Wire position monitor to sync controller via callbacks
- [x] Connect sync controller to transcription view via glib.IdleAdd
- [x] All tests passing (97.5% coverage on sync package)

**Test Cases:**
- ✅ Position change updates highlighted word
- ✅ Correct word is highlighted for timestamp
- ✅ Highlight moves smoothly with playback
- ✅ Integration start/stop lifecycle
- ✅ Multiple position updates handled correctly

#### 3.3 Click-to-Seek Integration (TDD: Green) ✅
- [x] Wire word click to video seek via Integration.HandleWordClick
- [x] Implement PlaybackPipeline.SeekTo(position float64)
- [x] Immediate sync update after seek (no waiting for poll)
- [x] Write comprehensive tests

**Test Cases:**
- ✅ Clicking word seeks to correct timestamp
- ✅ Seek completes and updates controller immediately
- ✅ Highlight updates after seek
- ✅ Nil player handled gracefully

#### 3.4 Refactor & Document ✅
- [x] Add comprehensive Go doc comments
- [x] Review thread safety (all UI updates via glib.IdleAdd)
- [x] Define clean interfaces (PipelineQuerier, PlaybackController, WordHighlighter)
- [x] Ensure proper cleanup on Stop() (unregister callbacks)

---

## Phase 4: Main Window Layout ✅
**Goal:** Create split-pane UI with video and transcription.

### Tasks

#### 4.1 Create Split Pane Layout
- [ ] Modify main window to use `gtk.Paned`
- [ ] Video widget on left (expandable)
- [ ] Transcription view on right (scrollable)
- [ ] Set initial pane position (60% video)

#### 4.2 Add Toolbar Controls
- [ ] Add playback controls: Play/Pause, Stop, Seek slider
- [ ] Add time display: current / total
- [ ] Style controls to match GNOME HIG

#### 4.3 Load Recording with Transcription
- [ ] Create unified loader for recording + transcription
- [ ] Handle missing transcription gracefully
- [ ] Show loading state during initialization

#### 4.4 Integration Testing
- [ ] End-to-end test: load video, play, verify sync
- [ ] Test click-to-seek
- [ ] Test resize handling
- [ ] Verify no memory leaks

---

## Phase 5: Polish & Finalize ✅
**Goal:** Final testing, documentation, and cleanup.

### Tasks

#### 5.1 Accessibility Improvements
- [ ] Verify WCAG AA contrast for highlighted words
- [ ] Add keyboard navigation (Tab between words)
- [ ] Test with screen reader

#### 5.2 Performance Optimization
- [ ] Profile memory usage during playback
- [ ] Optimize highlight updates (throttle if needed)
- [ ] Ensure 60fps UI responsiveness

#### 5.3 Error Handling
- [ ] Handle corrupted video files
- [ ] Handle missing transcription JSON
- [ ] Handle seek errors gracefully

#### 5.4 Documentation
- [ ] Update Go docs for all new packages
- [ ] Add usage notes to lessons-learned.md
- [ ] Update tech-debt.md if any shortcuts taken

#### 5.5 Final Verification
- [ ] Run full test suite: `go test ./...`
- [ ] Run build: `go build ./cmd/verbal`
- [ ] Manual QA: test with real recording
- [ ] Update tracks.md and mark complete

---

## Test Coverage Targets
- Controller package: 100%
- UI widgets: >80%
- Integration tests: Key user flows

## Dependencies
- ✅ GStreamer video widget
- ✅ Transcription data structures
- ✅ Recording metadata loading

## Risk Mitigation
- **GTK Thread Safety:** All UI updates via `glib.IdleAdd()`
- **Memory Leaks:** Use proper GTK object unreferencing
- **Performance:** Profile before optimizing; 10fps sync is sufficient
