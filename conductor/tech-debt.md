# Tech Debt

## Go + GTK4 Implementation (Current)

### High Severity
*(none currently)*

### Medium Severity
- **GStreamer pipeline path injection in waveform package** - `waveform/generator.go:getDuration()` and `waveform/gstreamer_extractor.go:runExtractionPipeline()` interpolate file paths directly into GStreamer pipeline strings without sanitization or quoting. The `thumbnail/gstreamer_extractor.go` correctly uses `quoteLocation()` for proper escaping. The waveform package should adopt the same pattern. [severity: medium]
- **Settings created without DB connection in main.go** - `SettingsRepository` was previously created via `&db.SettingsRepository{}` without a db connection (nil *sql.DB). Fixed during review to use `database.SettingsRepo()`. Pattern should be audited for similar issues. [severity: medium]
- **`go vet` and `go build` timeout on full project** - The UI package takes >2 minutes to vet/build due to CGo/GTK dependencies. Consider splitting build targets or caching. [severity: medium]
- **Embedded video preview requires gstreamer1.0-plugins-bad** - The code supports embedded preview via gtk4paintablesink, but users must install `gstreamer1.0-plugins-bad`. Falls back to external window if plugin not available. [severity: medium]

### Low Severity
- No Go tests for cmd/verbal main package (requires display for GTK). [severity: low]
- Libadwaita integration skipped due to Go 1.24 requirement. [severity: low]
- Media package test coverage at 46.8% - GStreamer pipeline tests require display/video files. [severity: low]
- **Word virtualization** - All word labels are created upfront in FlowBox. For very long recordings (1+ hours), this creates thousands of GTK widgets. Virtualized rendering would be needed for large transcriptions. [severity: low]
- ~~**Waveform generation uses synthetic data**~~ - [resolved: 2026-04-10] Replaced with GStreamer-based real audio extraction using gst-launch-1.0 subprocess approach.
- **WaveformWidget tooltip UI** - Hover tracking is implemented but actual tooltip display requires parent UI integration. Consider adding tooltip overlay or status bar display. [severity: low]
- **Export pipeline uses re-encoding** - SegmentExporter decodes and re-encodes (x264enc + voaacenc) instead of stream copy. This is slower and may reduce quality. Stream copy would be faster but requires matching codec parameters. [severity: low]

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
