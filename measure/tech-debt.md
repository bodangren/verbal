# Tech Debt

## Go + GTK4 Implementation (Current)

### High Severity
- ~~**BackupManager.CreateBackup uses raw file copy on live SQLite DB**~~ - [resolved: 2026-04-15 - Now uses BEGIN IMMEDIATE transaction for atomic backup when DB connection available]
- ~~**BackupManager.RestoreBackup is non-atomic with no rollback**~~ - [resolved: 2026-04-15 - Implemented atomic restore with temp file + fsync + rename pattern, pre-restore snapshot creation, and automatic rollback on failure]

### Medium Severity
- **`go vet` and `go build` timeout on full project** - CGo compilation for `gotk4-gstreamer` packages is extremely slow (~2min/package). Root cause: every full rebuild recompiles all CGo code. Solution requires `ccache` to cache CGo compilations. User must run `sudo apt-get install ccache` to enable. [severity: medium, tracked: chore_build_time_optimization_20260505]
- **Embedded video preview requires gstreamer1.0-plugins-bad** - [same as above]

### Low Severity
- **Widget Pool Index Mapping** - When implementing highlighting in virtualized containers, track the pool slot index (poolIdx), not the word index. Calculate poolIdx = wordIndex - startIdx based on current scroll position. [severity: low]
- **Design System Linter** - Use `npx @google/design.md lint` to validate DESIGN.md structure and catch issues before committing. [severity: low]
- **Media package test coverage** - GStreamer pipeline tests require display/video files. Pipeline tests skipped - require hardware. [severity: low]
- **WaveformWidget tooltip UI** - Hover tracking is implemented but actual tooltip display requires parent UI integration. [severity: low]
- **SQLite Schema Migrations** - When adding new columns to SQLite tables, use ALTER TABLE ADD COLUMN in migrations. Older DB files need backfill via migrate() function in repository.go. [severity: low]
- **Whisper CLI Dependency** - The local transcription requires whisper-cli binary to be installed. Model downloader provides HTTP download with progress. [severity: low]
- **Real-time Transcription Integration** - [integrated: 2026-05-07 - LiveCaptionWidget wired into PlaybackWindow, Ctrl+Shift+R accelerator added, RecordingTranscriber added to appState, toggleRealtimeTranscription function implemented] [severity: low, resolved]

## Resolved (Recent)

- ~~GStreamer error propagation, SetState returns ignored~~ - [resolved: 2026-04-05]
- ~~Transcription workflow regression~~ - [resolved: 2026-03-28]
- ~~Video sync core implementation, main window split-pane~~ - [resolved: 2026-04-03]
- ~~WCAG AA contrast, O(n) highlight clearing, seek boundary validation~~ - [resolved: 2026-04-04]
- ~~PlaybackWindow integration into main.go~~ - [resolved: 2026-04-05]
- ~~Settings UI implementation~~ - [resolved: 2026-04-08]
- ~~Transcription search by file path is imprecise~~ - [resolved: 2026-04-10]
- ~~Word virtualization, VirtualizedWordContainer bugs~~ - [resolved: 2026-04-25]
- ~~Export pipeline uses re-encoding, stream-copy, codec detection~~ - [resolved: 2026-05-01]
- ~~Path sanitization, dialog stubs, ThumbnailGenerator wiring~~ - [resolved: 2026-05-03]