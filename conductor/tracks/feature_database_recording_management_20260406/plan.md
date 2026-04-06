# Track: Feature - Database & Recording Management

**Status:** [~] In Progress
**Started:** 2026-04-06
**Goal:** Implement persistent storage layer (SQLite) for recording history, metadata, and searchable transcripts.

## Context
- `internal/db/` directory exists but is empty
- Current metadata is stored in JSON sidecar files
- Need centralized database for recording management and library view

## Success Criteria
1. SQLite database initialized on app startup
2. Recording records persisted with metadata (path, duration, transcription status, timestamps)
3. Query functions for listing, searching, and retrieving recordings
4. Migration from JSON sidecar files to database (optional, non-destructive)
5. Unit tests for database operations (≥80% coverage)

## Architecture
- `internal/db/` - Database layer (SQLite via mattn/go-sqlite3 or modernc.org/sqlite)
- Schema: `recordings` table with fields: id, file_path, duration, transcription_json, created_at, updated_at
- Repository pattern: `RecordingRepository` with CRUD operations

## Phases

### Phase 1: Database Foundation ✅
- [x] Add SQLite dependency
- [x] Define schema and migration system
- [x] Implement `RecordingRepository` with CRUD operations
- [x] Unit tests for database operations
- [x] Database initialization on app startup

### Phase 2: Recording Management
- [ ] Implement recording list/query UI
- [ ] Wire file open dialog to save recordings in database
- [ ] Search/filter recordings by transcription content
- [ ] Recording metadata display (duration, date, transcription status)

### Phase 3: Library View
- [ ] Create library view component
- [ ] Integrate with main window navigation
- [ ] Recording selection opens PlaybackWindow
- [ ] Persistent state (last opened recording, window position)

## Dependencies
- `modernc.org/sqlite` (pure Go SQLite, no CGO required)
- Existing `internal/media/` for recording metadata types
- Existing `internal/ui/` for UI components
