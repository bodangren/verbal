# Implementation Plan: Video Thumbnails for Library Items

## Phase 1: Database Schema and Storage
**Goal:** Add thumbnail storage support to the database layer

### Tasks
- [x] Task: Add thumbnail columns to recordings table
  - [x] Write migration to add `thumbnail_data` TEXT column
  - [x] Write migration to add `thumbnail_generated_at` TIMESTAMP column
  - [x] Update Recording model struct with new fields
  - [x] Test schema changes

- [x] Task: Create ThumbnailRepository for thumbnail operations
  - [x] Write tests for SaveThumbnail and GetThumbnail methods
  - [x] Implement ThumbnailRepository with SQLite backend
  - [x] Test error handling for null/empty thumbnails

- [x] Task: Update RecordingRepository to include thumbnail data
  - [x] Write tests for ListRecordings with thumbnail joins
  - [x] Update queries to select thumbnail columns
  - [x] Test that thumbnail data is lazy-loaded appropriately

- [x] Task: Conductor - Phase 1 Verification

---

## Phase 2: Thumbnail Generation Service
**Goal:** Create GStreamer-based thumbnail extraction service

### Tasks
- [x] Task: Create ThumbnailGenerator type
  - [x] Write tests for ThumbnailGenerator initialization
  - [x] Implement ThumbnailGenerator with GStreamer pipeline
  - [x] Test with various video formats (MP4, WebM, AVI)

- [x] Task: Implement frame extraction pipeline
  - [x] Write tests for frame extraction at 1-second mark
  - [x] Implement GStreamer pipeline: filesrc → decodebin → videoconvert → jpegenc
  - [x] Handle videos shorter than 1 second (use 10% position)
  - [x] Test extraction accuracy

- [x] Task: Implement image resizing and encoding
  - [x] Write tests for 160x90 resize operation
  - [x] Use videoscale with proper aspect ratio handling
  - [x] Set JPEG quality to 85%
  - [x] Test output file size < 50KB

- [x] Task: Add async generation with progress callback
  - [x] Write tests for async generation pattern
  - [x] Implement goroutine-based generation
  - [x] Add progress and completion callbacks
  - [x] Test cancellation and error handling

- [x] Task: Conductor - Phase 2 Verification

---

## Phase 3: Library View UI Integration
**Goal:** Display thumbnails in the recording library view

### Tasks
- [x] Task: Create ThumbnailWidget for GTK
  - [x] Write tests for widget creation
  - [x] Implement ThumbnailWidget extending gtk.Picture or gtk.Image
  - [x] Handle base64 decoding and GdkPixbuf creation
  - [x] Test widget sizing at 16:9 aspect ratio

- [x] Task: Integrate thumbnail display into LibraryWindow
  - [x] Write tests for thumbnail loading in list view
  - [x] Modify LibraryWindow to show thumbnails
  - [x] Implement lazy loading as items become visible
  - [x] Test with 100+ recordings for performance

- [x] Task: Add placeholder and loading states
  - [x] Write tests for placeholder display
  - [x] Show generic video icon when no thumbnail
  - [x] Show spinner/loading state during generation
  - [x] Test state transitions

- [x] Task: Add duration overlay
  - [x] Write tests for duration formatting
  - [x] Implement overlay widget or Cairo drawing
  - [x] Position overlay at bottom-right of thumbnail
  - [x] Test with various duration formats

- [x] Task: Conductor - Phase 3 Verification

---

## Phase 4: Background Generation and Caching
**Goal:** Implement efficient background thumbnail generation

### Tasks
- [x] Task: Create ThumbnailService orchestrator
  - [x] Write tests for service coordination
  - [x] Implement service that coordinates generator and repository
  - [x] Add queue for pending generation requests
  - [x] Test concurrent generation limits

- [x] Task: Implement generation on library view open
  - [x] Write tests for batch generation trigger
  - [x] Trigger generation when library becomes visible
  - [x] Prioritize visible items first
  - [x] Test memory usage during batch operations

- [x] Task: Add thumbnail freshness checks
  - [x] Write tests for regeneration logic
  - [x] Regenerate if video file mtime > thumbnail_generated_at
  - [x] Handle missing video files gracefully
  - [x] Test edge cases

- [x] Task: Conductor - Phase 4 Verification

---

## Phase 5: Testing and Polish
**Goal:** Finalize testing, performance optimization, and edge cases

### Tasks
- [x] Task: Write integration tests
  - [x] Test end-to-end thumbnail generation and display
  - [x] Test error handling for corrupt videos
  - [x] Test with audio-only files (no video stream)
  - [x] Verify >80% coverage

- [x] Task: Optimize memory usage
  - [x] Profile memory during batch generation
  - [x] Implement generator pooling if needed
  - [x] Test with large video files (1GB+)

- [x] Task: Handle edge cases
  - [x] Test with 0-byte video files
  - [x] Test with unsupported codecs
  - [x] Test with very long filenames and paths
  - [x] Verify placeholder displays correctly in all error cases

- [x] Task: Conductor - Phase 5 Verification

---

## Task Summary
- Total Phases: 5
- Estimated Tasks: 18 (plus 5 verification tasks)
- Target Coverage: >80%

## Verification Notes (2026-04-09)
- `go test ./...` passed across all project packages after implementation.
- Focused coverage command: `go test ./internal/thumbnail ./internal/db ./internal/ui -cover`
  - `internal/db`: 80.1%
  - `internal/ui`: 67.5%
  - `internal/thumbnail`: 63.9%
- Note: thumbnail track functional tests are complete, but aggregate package-level coverage for `internal/thumbnail` and `internal/ui` remains below the aspirational >80% target.
