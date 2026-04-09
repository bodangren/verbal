# Implementation Plan: Video Thumbnails for Library Items

## Phase 1: Database Schema and Storage
**Goal:** Add thumbnail storage support to the database layer

### Tasks
- [ ] Task: Add thumbnail columns to recordings table
  - [ ] Write migration to add `thumbnail_data` TEXT column
  - [ ] Write migration to add `thumbnail_generated_at` TIMESTAMP column
  - [ ] Update Recording model struct with new fields
  - [ ] Test schema changes

- [ ] Task: Create ThumbnailRepository for thumbnail operations
  - [ ] Write tests for SaveThumbnail and GetThumbnail methods
  - [ ] Implement ThumbnailRepository with SQLite backend
  - [ ] Test error handling for null/empty thumbnails

- [ ] Task: Update RecordingRepository to include thumbnail data
  - [ ] Write tests for ListRecordings with thumbnail joins
  - [ ] Update queries to select thumbnail columns
  - [ ] Test that thumbnail data is lazy-loaded appropriately

- [ ] Task: Conductor - Phase 1 Verification

---

## Phase 2: Thumbnail Generation Service
**Goal:** Create GStreamer-based thumbnail extraction service

### Tasks
- [ ] Task: Create ThumbnailGenerator type
  - [ ] Write tests for ThumbnailGenerator initialization
  - [ ] Implement ThumbnailGenerator with GStreamer pipeline
  - [ ] Test with various video formats (MP4, WebM, AVI)

- [ ] Task: Implement frame extraction pipeline
  - [ ] Write tests for frame extraction at 1-second mark
  - [ ] Implement GStreamer pipeline: filesrc → decodebin → videoconvert → jpegenc
  - [ ] Handle videos shorter than 1 second (use 10% position)
  - [ ] Test extraction accuracy

- [ ] Task: Implement image resizing and encoding
  - [ ] Write tests for 160x90 resize operation
  - [ ] Use videoscale with proper aspect ratio handling
  - [ ] Set JPEG quality to 85%
  - [ ] Test output file size < 50KB

- [ ] Task: Add async generation with progress callback
  - [ ] Write tests for async generation pattern
  - [ ] Implement goroutine-based generation
  - [ ] Add progress and completion callbacks
  - [ ] Test cancellation and error handling

- [ ] Task: Conductor - Phase 2 Verification

---

## Phase 3: Library View UI Integration
**Goal:** Display thumbnails in the recording library view

### Tasks
- [ ] Task: Create ThumbnailWidget for GTK
  - [ ] Write tests for widget creation
  - [ ] Implement ThumbnailWidget extending gtk.Picture or gtk.Image
  - [ ] Handle base64 decoding and GdkPixbuf creation
  - [ ] Test widget sizing at 16:9 aspect ratio

- [ ] Task: Integrate thumbnail display into LibraryWindow
  - [ ] Write tests for thumbnail loading in list view
  - [ ] Modify LibraryWindow to show thumbnails
  - [ ] Implement lazy loading as items become visible
  - [ ] Test with 100+ recordings for performance

- [ ] Task: Add placeholder and loading states
  - [ ] Write tests for placeholder display
  - [ ] Show generic video icon when no thumbnail
  - [ ] Show spinner/loading state during generation
  - [ ] Test state transitions

- [ ] Task: Add duration overlay
  - [ ] Write tests for duration formatting
  - [ ] Implement overlay widget or Cairo drawing
  - [ ] Position overlay at bottom-right of thumbnail
  - [ ] Test with various duration formats

- [ ] Task: Conductor - Phase 3 Verification

---

## Phase 4: Background Generation and Caching
**Goal:** Implement efficient background thumbnail generation

### Tasks
- [ ] Task: Create ThumbnailService orchestrator
  - [ ] Write tests for service coordination
  - [ ] Implement service that coordinates generator and repository
  - [ ] Add queue for pending generation requests
  - [ ] Test concurrent generation limits

- [ ] Task: Implement generation on library view open
  - [ ] Write tests for batch generation trigger
  - [ ] Trigger generation when library becomes visible
  - [ ] Prioritize visible items first
  - [ ] Test memory usage during batch operations

- [ ] Task: Add thumbnail freshness checks
  - [ ] Write tests for regeneration logic
  - [ ] Regenerate if video file mtime > thumbnail_generated_at
  - [ ] Handle missing video files gracefully
  - [ ] Test edge cases

- [ ] Task: Conductor - Phase 4 Verification

---

## Phase 5: Testing and Polish
**Goal:** Finalize testing, performance optimization, and edge cases

### Tasks
- [ ] Task: Write integration tests
  - [ ] Test end-to-end thumbnail generation and display
  - [ ] Test error handling for corrupt videos
  - [ ] Test with audio-only files (no video stream)
  - [ ] Verify >80% coverage

- [ ] Task: Optimize memory usage
  - [ ] Profile memory during batch generation
  - [ ] Implement generator pooling if needed
  - [ ] Test with large video files (1GB+)

- [ ] Task: Handle edge cases
  - [ ] Test with 0-byte video files
  - [ ] Test with unsupported codecs
  - [ ] Test with very long filenames and paths
  - [ ] Verify placeholder displays correctly in all error cases

- [ ] Task: Conductor - Phase 5 Verification

---

## Task Summary
- Total Phases: 5
- Estimated Tasks: 18 (plus 5 verification tasks)
- Target Coverage: >80%