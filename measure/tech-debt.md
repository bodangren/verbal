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
- **Filler Detection Package** - New `internal/filler` package for detecting filler words (um, uh, like, etc.) and repetition patterns in transcription data. [severity: low]
- **Libadwaita integration skipped due to Go 1.24 requirement** - [severity: low]
- **Media package test coverage** - GStreamer pipeline tests require display/video files. Pipeline tests skipped - require hardware. [severity: low]
- **WaveformWidget tooltip UI** - Hover tracking is implemented but actual tooltip display requires parent UI integration. [severity: low]
- **Export multi-segment stream-copy** - Multi-segment stream-copy concatenation requires precise timestamp rewriting at segment boundaries. Current implementation uses re-encode for all multi-segment exports. [severity: low]
- **Text-Driven Editing Core implemented** - New `internal/edit` package with Operation interface, DeleteOperation, ReorderOperation, InsertSilenceOperation, SplitOperation, TranscriptMapper, EditTimeline. [severity: low]
- **Filler Summary Widget** - New `internal/ui/fillersummary.go` displays filler counts by type, navigation buttons, and Remove All Fillers button. Integration with PlaybackWindow complete. [severity: low]
- **FillerRemovalService** - New `internal/filler/removal.go` computes non-filler segments and uses SegmentExporter for removal. Core service implemented, full UI integration (progress dialog, SQLite updates, UI refresh) pending. [severity: low]

## Resolved (Recent)

- ~~GStreamer error propagation~~ - [resolved: 2026-04-05]
- ~~SetState return values ignored~~ - [resolved: 2026-04-05]
- ~~Transcription workflow regression~~ - [resolved: 2026-03-28]
- ~~GStreamer video sink uses separate window~~ - [resolved: 2026-03-26]
- ~~Recording pipeline uses test sources~~ - [resolved: 2026-03-26]
- ~~Google Speech API format conversion~~ - [resolved: 2026-03-30]
- ~~Backoff jitter not implemented~~ - [resolved: 2026-03-30]
- ~~Video sync core implementation~~ - [resolved: 2026-04-02]
- ~~Main window split-pane layout~~ - [resolved: 2026-04-03]
- ~~PlaybackWindow integration into main.go~~ - [resolved: 2026-04-05]
- ~~WCAG AA contrast for highlighted words~~ - [resolved: 2026-04-04]
- ~~O(n) highlight clearing on every position update~~ - [resolved: 2026-04-04]
- ~~No seek boundary validation~~ - [resolved: 2026-04-04]
- ~~Settings UI implementation~~ - [resolved: 2026-04-08]
- ~~Transcription search by file path is imprecise~~ - [resolved: 2026-04-10]
- ~~Word virtualization~~ - [resolved: 2026-04-25]
- ~~Export pipeline uses re-encoding~~ - [resolved: 2026-05-01]
- ~~GstCodecDetector.Detect is non-functional~~ - [resolved: 2026-05-03]
- ~~Inconsistent path sanitization functions~~ - [resolved: 2026-05-03]
- ~~Export/Import/Repair dialogs use simulation stubs~~ - [resolved: 2026-05-03]
- ~~DatabaseRepairer needs real ThumbnailGenerator integration~~ - [resolved: 2026-05-03]