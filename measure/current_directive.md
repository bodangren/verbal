# Current Directive: Fix Codec Detector and Wire Real Export Operations

## Status: COMPLETED - 2026-05-03

All phases (1-5) complete. Lifecycle operations now wired to dialogs.

---

## Completed: Phase 1-5 (2026-05-03)

**Phase 1:** GstCodecDetector now implements pad-added signal handler. Uses `bin.ByName("dec")` to get decodebin, connects `ConnectPadAdded(func(newPad *gst.Pad))` to receive pads as they're created, extracts codec info via `newPad.CurrentCaps().String()` parsing.

**Phase 2:** Created `internal/media/sanitize.go` with `QuoteLocation()` and `Join()`. Replaced all 4 variants across export.go, generator.go, gstreamer_extractor.go, and segment_editor.go.

**Phase 3-5:** Replaced sleep-loop simulations with real lifecycle calls:
- `showExportDialog`: Calls `state.archiveExporter.Export/ExportAll` with progress callback
- `showImportDialog`: Calls `state.archiveImporter.Import` with progress callback
- `showRepairDialog`: Calls `state.databaseInspector.RunAllChecks` and `state.databaseRepairer.RepairAll`

Created adapter types to bridge lifecycle interfaces with app services:
- `recordingProviderAdapter`: implements `lifecycle.RecordingProvider` using `RecordingService`
- `importerRecordingStore`: implements `lifecycle.RecordingStore` using `RecordingService`
- `realFileWriter`: implements `lifecycle.FileWriter` for filesystem operations

**Verification:**
- Commit: (pending)
- lifecycle tests pass (1.867s)
- db tests pass (0.749s)
- go vet passes
- Binary smoke check passes

---

## Upcoming Tracks

- **Track: Filler Word Detection UI Integration** - Integrate the existing internal/filler package into the transcript UI: highlight filler words, display a summary panel with counts, and implement one-click removal of individual or all filler words.
  *Status: Pending. Spec and plan created. Awaiting implementation.*
  *Link: [./tracks/feature_filler_word_ui_integration_20260502/](./tracks/feature_filler_word_ui_integration_20260502/)