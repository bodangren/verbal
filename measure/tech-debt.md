# Tech Debt

## Go + GTK4 Implementation (Current)

### High Severity
- ~~**BackupManager.CreateBackup uses raw file copy on live SQLite DB**~~ - [resolved: 2026-04-15 - Now uses BEGIN IMMEDIATE transaction for atomic backup when DB connection available]
- ~~**BackupManager.RestoreBackup is non-atomic with no rollback**~~ - [resolved: 2026-04-15 - Implemented atomic restore with temp file + fsync + rename pattern, pre-restore snapshot creation, and automatic rollback on failure]

### Medium Severity
- **`go vet` and `go build` timeout on full project** - The UI package takes >2 minutes to vet/build due to CGo/GTK dependencies. Consider splitting build targets or caching. [severity: medium]
- **Embedded video preview requires gstreamer1.0-plugins-bad** - The code supports embedded preview via gtk4paintablesink, but users must install `gstreamer1.0-plugins-bad`. Falls back to external window if plugin not available. [severity: medium]
- **Libadwaita integration in progress** - gotk4-adwaita bindings added (adw package). Phase 1-2 complete. main.go now uses adw.Application and adw.ApplicationWindow with adw.Init() called. [severity: medium]
- ~~**VirtualizedWordContainer.UpdateVisibleWidgets never removes old widgets from FlowBox**~~ - [resolved: 2026-04-24 - Added `flowBox.RemoveAll()` before appending new widgets in IdleAdd callback]
- ~~**VirtualizedWordContainer.SetHighlightedWord indexes pool by word index**~~ - [resolved: 2026-04-24 - Replaced `lastHighlightedIdx` with `highlightedPoolIdx` tracking pool slot]
- ~~**VirtualizedWordContainer.UpdateVisibleWidgets has data race on words slice**~~ - [resolved: 2026-04-24 - Changed binary search to take words parameter for snapshot under lock]

### Low Severity
- **Widget Pool Index Mapping** - When implementing highlighting in virtualized containers, track the pool slot index (poolIdx), not the word index. Calculate poolIdx = wordIndex - startIdx based on current scroll position. [severity: low]
- **Design System Linter** - Use `npx @google/design.md lint` to validate DESIGN.md structure and catch issues before committing. [severity: low]
- **Media package test coverage** - GStreamer pipeline tests require display/video files. Pipeline tests skipped - require hardware. [severity: low]
- **WaveformWidget tooltip UI** - Hover tracking is implemented but actual tooltip display requires parent UI integration. [severity: low]
- **Multi-segment stream-copy timestamp rewriting** - Multi-segment stream-copy concatenation requires precise timestamp rewriting at segment boundaries. Phase 1-4 complete with TimestampMapper. UI integration deferred (CGo build timeout). [severity: low]

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