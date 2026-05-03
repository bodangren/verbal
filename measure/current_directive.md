# Current Directive: Fix Codec Detector and Wire Real Export Operations

## Status: IN PROGRESS - Phase 1-2 complete, Phase 3-5 pending

Phase 1 (GstCodecDetector fix) and Phase 2 (path sanitization consolidation) are complete. Phase 3-5 (lifecycle wiring in dialogs) pending.

---

## Last Completed: Phase 1-2 (2026-05-03)

**Phase 1:** GstCodecDetector now implements pad-added signal handler. Uses `bin.ByName("dec")` to get decodebin, connects `ConnectPadAdded(func(newPad *gst.Pad))` to receive pads as they're created, extracts codec info via `newPad.CurrentCaps().String()` parsing.

**Phase 2:** Created `internal/media/sanitize.go` with `QuoteLocation()` and `Join()`. Replaced all 4 variants across export.go, generator.go, gstreamer_extractor.go, and segment_editor.go.

**Verification**
- Commit: `37cdf72 fix(media): implement GstCodecDetector pad-added signal and consolidate path sanitization`
- All media, waveform, thumbnail, edit tests pass
- Build succeeds

---

## Upcoming Tracks

- **Track: Fix Codec Detector and Wire Real Export Operations** - Phase 3-5 pending: wire real lifecycle operations (Export/Import/Repair) into dialogs.
  *Status: In Progress. Phase 1-2 complete.*
  *Link: [./tracks/bugfix_codec_detector_real_export_wiring_20260502/](./tracks/bugfix_codec_detector_real_export_wiring_20260502/)*

- **Track: Filler Word Detection UI Integration** - Integrate the existing internal/filler package into the transcript UI: highlight filler words, display a summary panel with counts, and implement one-click removal of individual or all filler words.
  *Status: Pending. Spec and plan created. Awaiting implementation.*
  *Link: [./tracks/feature_filler_word_ui_integration_20260502/](./tracks/feature_filler_word_ui_integration_20260502/)*