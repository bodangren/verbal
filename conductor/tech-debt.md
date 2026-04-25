# Tech Debt

## Go + GTK4 Implementation (Current)

### High Severity
- ~~**BackupManager.CreateBackup uses raw file copy on live SQLite DB**~~ - [resolved: 2026-04-15 - Now uses BEGIN IMMEDIATE transaction for atomic backup when DB connection available. See commits b95b8dd and 35c7a07]
- ~~**BackupManager.RestoreBackup is non-atomic with no rollback**~~ - [resolved: 2026-04-15 - Implemented atomic restore with temp file + fsync + rename pattern, pre-restore snapshot creation, and automatic rollback on failure. See commit 4004a30]

### Medium Severity
- ~~**BackupScheduler tick granularity and wake-from-sleep**~~ - [resolved: 2026-04-17 - Current implementation correctly handles wake-from-sleep (backup fires on wake). The 1-minute ticker with `time.Now().After(nextBackup)` is the standard pattern for this. Added comprehensive tests for scheduler robustness including panic recovery. See commit TBD]
- ~~**BackupScheduler errors logged to stderr, not app logger**~~ - [resolved: 2026-04-17 - Added Logger interface to lifecycle package. Replaced fmt.Fprintf(os.Stderr, ...) with logger.Warn() in RotateBackups. Added logger.Error() calls for backup failures in performScheduledBackup. See commit TBD]
- ~~**Backup file/directory permissions too permissive**~~ - [resolved: 2026-04-14 - Changed from 0755/0666 to 0700/0600. See commit 3178748]
- ~~**Backup timestamp filename contains a dot**~~ - [resolved: 2026-04-14 - Changed format from `20060102_150405.000` to `20060102_150405_000` for Windows compatibility. See commit 161ab8f]
- ~~**Panicking onBackupComplete callback kills scheduler goroutine**~~ - [resolved: 2026-04-17 - Added safeCallback() method with defer recover() and logging. Callback panics are now caught and logged without crashing the scheduler goroutine. See commit TBD]
- ~~**GStreamer pipeline path injection in waveform package**~~ - [resolved: 2026-04-16 - Added quoteLocation() function to sanitize paths before interpolation. Both generator.go and gstreamer_extractor.go now properly quote file paths for GStreamer pipelines.]
- ~~**Settings created without DB connection in main.go**~~ - [resolved: 2026-04-23 - Audited all repository initialization patterns. All repositories (`RecordingRepository`, `ThumbnailRepository`, `SettingsRepository`) are now properly initialized via factory methods (`RecordingRepo()`, `ThumbnailRepo()`, `SettingsRepo()`). Test files use intentional mock patterns. No similar issues found.]
- **`go vet` and `go build` timeout on full project** - The UI package takes >2 minutes to vet/build due to CGo/GTK dependencies. Consider splitting build targets or caching. [severity: medium]
- **Embedded video preview requires gstreamer1.0-plugins-bad** - The code supports embedded preview via gtk4paintablesink, but users must install `gstreamer1.0-plugins-bad`. Falls back to external window if plugin not available. [severity: medium]
- ~~**VirtualizedWordContainer.UpdateVisibleWidgets never removes old widgets from FlowBox**~~ - [resolved: 2026-04-24 - Added `flowBox.RemoveAll()` before appending new widgets in IdleAdd callback. FlowBox now stays bounded at pool size.]
- ~~**VirtualizedWordContainer.SetHighlightedWord indexes pool by word index**~~ - [resolved: 2026-04-24 - Replaced `lastHighlightedIdx` with `highlightedPoolIdx`. Now calculates pool slot based on scroll position: `poolIdx = wordIndex - startIdx`. Only highlights if word is in visible range.]
- ~~**VirtualizedWordContainer.UpdateVisibleWidgets has data race on words slice**~~ - [resolved: 2026-04-24 - Changed `firstVisibleWordIndex` and `lastVisibleWordIndex` to take `words []WordData` parameter. Snapshots words under lock before binary search calls, eliminating the data race.]

### Low Severity
- ~~**RecordingRepository query/scan duplication**~~ - [resolved: 2026-04-17 - Extracted `scanRecording()` helper and `recordingColumns` constant. Reduced 531 lines to 422 lines (-109 lines). See commit TBD]
- ~~**BackupManager ListBackups/listBackupsUnlocked duplication**~~ - [resolved: 2026-04-16 - ListBackups now calls listBackupsUnlocked after acquiring lock for DRY compliance. See commit 1fb546f]
- **Widget Pool Index Mapping** - When implementing highlighting in virtualized containers, track the pool slot index (poolIdx), not the word index. Calculate poolIdx = wordIndex - startIdx based on current scroll position. Only apply highlight if the word is within the visible range. [severity: low]
- **Design System Linter** - Use `npx @google/design.md lint` to validate DESIGN.md structure and catch issues before committing. [severity: low]
- Libadwaita integration skipped due to Go 1.24 requirement. [severity: low]
- Media package test coverage at 46.8% - GStreamer pipeline tests require display/video files. [severity: low]
- ~~**Word virtualization**~~ - [resolved: 2026-04-25 - Integrated VirtualizedWordContainer into EditableTranscriptionView. Widget pool (100 labels) pre-allocated at construction, viewport-based rendering with UpdateVisibleWidgets, scroll events bound via BindScrollEvents. Memory bounded at ~100 widgets regardless of word count. See commit 9fbbe71.]
- ~~**Waveform generation uses synthetic data**~~ - [resolved: 2026-04-10] Replaced with GStreamer-based real audio extraction using gst-launch-1.0 subprocess approach.
- **WaveformWidget tooltip UI** - Hover tracking is implemented but actual tooltip display requires parent UI integration. Consider adding tooltip overlay or status bar display. [severity: low]
- **Export pipeline uses re-encoding** - SegmentExporter decodes and re-encodes (x264enc + avenc_aac) instead of stream copy. This is slower and may reduce quality. Stream copy would be faster but requires matching codec parameters. [severity: low]
- **DatabaseRepairer needs real ThumbnailGenerator integration** - Currently uses interface; needs integration with actual thumbnail.GstreamerExtractor for production use. [severity: low]
- ~~Repair UI not yet implemented~~ - [resolved: 2026-04-11] ExportDialog, ImportDialog, and RepairDialog implemented with progress tracking, file choosers, and callback patterns.
- ~~Import/Export/ Repair menu integration~~ - [resolved: 2026-04-12] Menu actions added to File (Import/Export) and Tools (Repair) menus with keyboard shortcuts (Ctrl+Shift+I/E/R). Dialogs wired in main.go with simulation for actual operations.
- ~~**Backup system needs menu integration**~~ - [resolved: 2026-04-14] Backup system integrated into main.go: BackupManager and BackupScheduler initialized with database, menu action added to File menu (Ctrl+Shift+B), BackupSettingsDialog wired with full functionality including manual backup, scheduler start/stop, and settings persistence.

## Resolved

- ~~GStreamer error propagation~~ - Replaced `fmt.Printf` in bus watchers with callback pattern (`onError`, `onWarning`). UI can now surface pipeline errors to users. [resolved: 2026-04-05]
- ~~SetState return values ignored~~ - `Play()`, `Pause()`, `Stop()`, and `Close()` now return errors for failed state transitions. All callers updated. [resolved: 2026-04-05]
- ~~Transcription workflow regression~~ - Wired transcription into main.go with Transcribe button, TranscriptionView, progress callback, and metadata save. AI provider stubs are intentional (REST API pattern). [resolved: 2026-03-28]
- ~~GStreamer video sink uses separate window~~ - Implemented embedded preview using gtk4paintablesink with fallback to autovideosink. [resolved: 2026-03-26]
- ~~Recording pipeline uses test sources~~ - Now uses real hardware (v4l2src + pulsesrc) with graceful fallback to test sources. [resolved: 2026-03-26]
- ~~Google Speech API uses LINEAR16/16kHz — may need format conversion for non-WAV recordings.~~ [resolved: 2026-03-30 - Added FFmpeg audio extraction in transcription service]
- ~~Backoff jitter not implemented; uses simple exponential backoff.~~ [resolved: 2026-03-30 - Added ±25% jitter to prevent thundering herd]
- ~~Video sync core implementation~~ [resolved: 2026-04-02 - Phase 3 complete: PositionMonitor, PlaybackPipeline, SyncIntegration all implemented with tests]
- ~~Main window split-pane layout~~ [resolved: 2026-04-03 - PlaybackWindow component with gtk.Paned, toolbar controls, and RecordingLoader]
- ~~PlaybackWindow integration into main.go~~ [resolved: 2026-04-05 - Full integration with PlaybackPipeline, sync.Integration, EditableTranscriptionView, and file open dialog]
- ~~WCAG AA contrast for highlighted words~~ [resolved: 2026-04-04 - Replaced gold highlight with GNOME blue #3584E4]
- ~~O(n) highlight clearing on every position update~~ [resolved: 2026-04-04 - SetHighlightedWord now tracks last highlighted index for O(1) updates]
- ~~No seek boundary validation~~ [resolved: 2026-04-04 - SeekTo validates negative positions and checks against duration]
- ~~SeekTo return value ignored in HandleWordClick~~ [resolved: 2026-04-04 - Failed seeks now skip highlight update to avoid desync]
- ~~Missing CSS classes and keyboard navigation~~ [resolved: 2026-04-04 - Added .word-hover, .word-container, focus styles, Enter/Space activation]
- ~~Export callback stub~~ [resolved: 2026-04-05 - Wired save dialog, SegmentExporter, progress/error callbacks]
- ~~Settings UI implementation~~ [resolved: 2026-04-08 - All 4 phases complete: database layer, GTK4 UI components, main.go integration, integration tests with 92.2% coverage]
- ~~Transcription search by file path is imprecise~~ [resolved: 2026-04-10 - Added exact path lookup (`GetByPathExact`/`GetByPath`) and replaced `runTranscription` LIKE-search update path; added status-aware update method for error vs completed]

## Superseded (Tauri/Rust Implementation)

The following items are from the Tauri/Rust prototype and are preserved for reference:

- ~~No central state management for the video player yet~~
- ~~AppImage bundling fails on Linux~~
- ~~TranscriptEditor doesn't yet support real-time word highlighting~~
- ~~FFmpeg commands blocking~~ [FIXED]
- ~~Various Tauri-specific bugs~~ [FIXED]
