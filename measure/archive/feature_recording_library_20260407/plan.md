# Implementation Plan: Recording Library View

## Phase 1: Database Integration & Recording Model
**Goal**: Extend database repository with methods needed for library view and integrate into app lifecycle.

**TDD Cycle**: Red-Green-Refactor for each task.

### Task 1.1: Add Library Query Methods to Repository
- [x] Write tests for `ListRecent(limit int)` method
- [x] Write tests for `SearchByPath(query string)` method
- [x] Write tests for `UpdateOrInsert(rec *Recording)` method (upsert)
- [x] Implement the methods in `repository.go`
- [x] Verify tests pass
- [x] Commit with git note

### Task 1.2: Create Recording Service Layer
- [x] Write tests for `RecordingService` struct that wraps db operations
- [x] Implement `RecordingService` in `internal/db/service.go`
- [x] Methods: `GetLibrary()`, `Search(query)`, `AddRecording(path, duration)`, `UpdateTranscription(id, json)`
- [x] Verify tests pass (>80% coverage)
- [x] Commit with git note

### Task 1.3: Integrate Database into App Startup
- [x] Modify `main.go` to initialize database on startup
- [x] Use `~/.config/verbal/recordings.db` as default path
- [x] Handle database initialization errors gracefully
- [x] Add database close on app shutdown
- [x] Test manually (no display needed for db init)
- [x] Commit with git note

## Phase 2: Library View UI Components
**Goal**: Create GTK4 components for displaying and interacting with the recording library.

### Task 2.1: Create RecordingListItem Widget
- [x] Write tests for `RecordingListItem` component
- [x] Create `internal/ui/recordinglistitem.go`
- [x] Display: filename, duration (formatted), status badge, date
- [x] Add CSS classes for styling
- [x] Implement `SetRecording(rec *db.Recording)` method
- [x] Commit with git note

### Task 2.2: Create LibraryView Container
- [x] Write tests for `LibraryView` component
- [x] Create `internal/ui/libraryview.go`
- [x] Components: search entry, list view (GtkListView or FlowBox), empty state
- [x] Implement search functionality (debounced, 300ms)
- [x] Add "Open File" button to toolbar
- [x] Implement callbacks: `OnRecordingSelected`, `OnOpenFile`, `OnSearch`
- [x] Commit with git note

### Task 2.3: Add Styling for Library View
- [x] Add CSS rules to `internal/ui/styling.go` or new stylesheet
- [x] Styles for: list item hover, status badges, empty state
- [x] Follow GNOME HIG (spacing, colors)
- [x] Test CSS loading in app
- [x] Commit with git note

## Phase 3: Main Window Integration
**Goal**: Replace file dialog on startup with library view, add navigation.

### Task 3.1: Refactor Main Window for View Switching
- [x] Modify `main.go` to use `GtkStack` for view navigation
- [x] Create "library" and "playback" stack children
- [x] Implement `showLibraryView()` and `showPlaybackView()` functions
- [x] Remove immediate file dialog on startup
- [x] Commit with git note

### Task 3.2: Wire Library Actions
- [x] Connect "Open File" button to existing file dialog
- [x] Connect recording selection to `loadRecording()`
- [x] After loading, switch to playback view
- [x] Add "Back to Library" action (Ctrl+L)
- [x] Update menu actions
- [x] Commit with git note

### Task 3.3: Auto-Add Recordings to Library
- [x] When file is opened via dialog, add to database
- [x] When transcription completes, update database record
- [x] Preserve existing sidecar JSON (dual persistence)
- [x] Commit with git note

## Phase 4: Polish & Edge Cases
**Goal**: Handle edge cases, improve UX, and ensure quality.

### Task 4.1: Empty State & Error Handling
- [ ] Create empty state widget for when no recordings exist
- [ ] Add "Get Started" button that opens file dialog
- [ ] Handle database errors in UI (show error banner)
- [ ] Handle missing files gracefully (mark as "missing" in UI)
- [ ] Commit with git note

### Task 4.2: Keyboard Navigation
- [ ] Ensure arrow keys navigate the recording list
- [ ] Enter key opens selected recording
- [ ] Ctrl+F focuses search entry
- [ ] Test keyboard navigation
- [ ] Commit with git note

### Task 4.3: Delete Functionality
- [ ] Add delete button to list items (with confirmation dialog)
- [ ] Implement `Delete(id)` in repository
- [ ] Remove from list after deletion
- [ ] Commit with git note

## Phase 5: Final Verification
**Goal**: Full test suite, build verification, documentation.

### Task 5.1: Full Test Suite
- [ ] Run all tests: `go test ./...`
- [ ] Verify coverage >80% for new code: `go test -cover ./internal/db/... ./internal/ui/...`
- [ ] Fix any failing tests
- [ ] Commit with git note

### Task 5.2: Build Verification
- [ ] Build app: `go build ./cmd/verbal`
- [ ] Check for compiler warnings
- [ ] Verify binary runs (manual smoke test if possible)
- [ ] Commit with git note

### Task 5.3: Update Documentation
- [ ] Update `measure/tech-debt.md` with any new items
- [ ] Update `measure/lessons-learned.md` with insights (keep ≤50 lines)
- [ ] Update `measure/current_directive.md` with completion status
- [ ] Commit with git note

### Task 5.4: Final Commit & Push
- [ ] Create final commit: "feat: Add Recording Library view with database integration"
- [ ] Push to origin
- [ ] Mark track as complete in `measure/tracks.md`

## Dependencies
- `internal/db` package (exists)
- `github.com/diamondburned/gotk4/pkg/gtk/v4` (exists)
- SQLite driver: `modernc.org/sqlite` (exists)

## Estimated Effort
- Phase 1: 2-3 hours
- Phase 2: 3-4 hours
- Phase 3: 2-3 hours
- Phase 4: 2 hours
- Phase 5: 1 hour
- Total: ~12 hours

## Risk Areas
1. **GTK4 ListView vs FlowBox**: ListView is more efficient but FlowBox is simpler. Start with FlowBox, optimize if needed.
2. **Database Migration**: If schema changes needed, handle migration carefully.
3. **Duration Extraction**: May need GStreamer to get video duration; can defer to v1 (show "Unknown").
