# Track Spec: Recording Library View

## Overview
Add a recording library/management view that displays all recordings from the SQLite database. This changes the application UX from "immediately show file open dialog" to "show library first, then allow opening/creating recordings".

## Goals
1. Provide users with a browsable history of all recordings
2. Enable search functionality for finding recordings by file path or transcription content
3. Maintain the existing workflow while adding library as entry point
4. Integrate seamlessly with the existing database layer

## Requirements

### Functional Requirements

#### FR1: Library View Component
- Create a new `LibraryView` GTK4 component in `internal/ui/`
- Display recordings in a scrollable list/grid
- Show key metadata for each recording:
  - File name (extracted from path)
  - Duration (formatted as MM:SS or HH:MM:SS)
  - Transcription status (pending/completed/error)
  - Created date (formatted nicely)
  - Thumbnail preview (if available) or placeholder

#### FR2: Recording Database Integration
- Initialize database connection on app startup
- Store default database at `~/.config/verbal/recordings.db`
- Auto-add recordings to database when opened/transcribed
- Maintain backward compatibility with existing sidecar JSON metadata

#### FR3: Library Actions
- Double-click or "Open" button to load recording into PlaybackWindow
- "Delete" button to remove from library (with confirmation dialog)
- "Open File" button to browse for new recordings (existing functionality)
- Search bar to filter recordings by:
  - File path/name
  - Transcription content (if available)

#### FR4: Main Window Integration
- Replace immediate file dialog with library view on startup
- Add navigation between Library and Playback views
- Preserve existing menu actions (Ctrl+O for open, Ctrl+T for transcribe)

### Non-Functional Requirements

#### NFR1: Performance
- Library view should load within 1 second for up to 1000 recordings
- Search should be responsive (debounced input, <300ms response)
- Lazy loading of thumbnails if implemented

#### NFR2: GTK4 Best Practices
- Use GTK4 ListView or FlowBox for efficient rendering
- Follow GNOME HIG for layout and spacing
- Support keyboard navigation (arrow keys, Enter to open)

#### NFR3: Error Handling
- Graceful handling of missing database files
- Clear error messages for database read/write failures
- Fallback to file dialog if database is unavailable

## Acceptance Criteria

1. **AC1**: Launching the app shows the Library view with all previously opened recordings
2. **AC2**: Opening a new file via Ctrl+O or "Open File" button adds it to the library
3. **AC3**: Search filters recordings in real-time (debounced)
4. **AC4**: Clicking a recording opens it in the PlaybackWindow with transcription sync
5. **AC5**: Recording metadata is persisted to SQLite and survives app restart
6. **AC6**: All existing tests pass, new tests achieve >80% coverage for new code
7. **AC7**: UI follows GNOME HIG guidelines (spacing, typography, colors)

## Out of Scope
- Video thumbnails (can be added later as enhancement)
- Recording preview/playback in library view
- Import/export of recording database
- Cloud sync of library

## Technical Notes

### Database Schema (Existing)
The `internal/db` package already has a `recordings` table:
```sql
CREATE TABLE recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    transcription_status TEXT NOT NULL DEFAULT 'pending',
    transcription_json TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Integration Points
1. **App startup** (`cmd/verbal/main.go`): Initialize database, show LibraryView instead of file dialog
2. **File loading** (`loadRecording`): Add/update recording in database
3. **Transcription complete** (`runTranscription`): Update transcription status and JSON
4. **Recording loader** (`internal/ui/recordingloader.go`): May need to integrate with database

### UI Components Needed
- `LibraryView`: Main container with search bar and recording list
- `RecordingListItem`: Individual recording row/card with metadata
- Search entry with clear button
- Empty state view (when no recordings exist)

## Success Criteria
- Users can see all their recordings on app launch
- Search works for finding specific recordings
- No regression in existing playback/transcription features
- Code coverage >80% for new UI components
