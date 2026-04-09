# Track: Feature - Database & Recording Management

**Status:** [x] Completed (reconciled 2026-04-10)
**Started:** 2026-04-06
**Completed:** 2026-04-10
**Goal:** Implement persistent storage layer (SQLite) for recording history, metadata, and searchable transcripts.

## Reconciliation Summary
- This track started the database foundation and was later delivered across successor tracks.
- Core DB foundation landed in this track's original scope.
- UI/library and recording lifecycle integration landed in:
  - `feature_recording_library_20260407`
  - `feature_video_thumbnails_20260409`
  - `chore_test_truthfulness_e2e_20260409` (runtime revalidation)

## Success Criteria
1. SQLite database initialized on app startup
2. Recording records persisted with metadata (path, duration, transcription status, timestamps)
3. Query functions for listing, searching, and retrieving recordings
4. Migration from JSON sidecar files to database (optional, non-destructive)
5. Unit tests for database operations (>=80% coverage target)

## Phases

### Phase 1: Database Foundation
- [x] Add SQLite dependency
- [x] Define schema and migration system
- [x] Implement `RecordingRepository` with CRUD operations
- [x] Unit tests for database operations
- [x] Database initialization on app startup

### Phase 2: Recording Management (Delivered via successor tracks)
- [x] Implement recording list/query UI (completed in `feature_recording_library_20260407`)
- [x] Wire file open dialog to save recordings in database (completed in `feature_recording_library_20260407`)
- [x] Search/filter recordings by transcription content (completed in `feature_recording_library_20260407`)
- [x] Recording metadata display (duration, date, transcription status) (completed in `feature_recording_library_20260407`)

### Phase 3: Library View (Delivered via successor tracks)
- [x] Create library view component (completed in `feature_recording_library_20260407`)
- [x] Integrate with main window navigation (completed in `feature_recording_library_20260407`)
- [x] Recording selection opens PlaybackWindow (completed in `feature_recording_library_20260407`)
- [x] Persistent state (last opened recording, window position) (completed in `feature_recording_library_20260407`)

### Phase 4: Conductor Closure Reconciliation
- [x] Reconcile this track with successor delivery tracks
- [x] Add missing Conductor artifacts (`metadata.json`, `spec.md`)
- [x] Update plan checkboxes to reflect implemented vs superseded work
- [x] Update `conductor/tracks.md` and `conductor/current_directive.md` with final closure status

## Dependencies
- `modernc.org/sqlite` (pure Go SQLite, no CGO required)
- Existing `internal/media/` for recording metadata types
- Existing `internal/ui/` for UI components
