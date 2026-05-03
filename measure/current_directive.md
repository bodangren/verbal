# Current Directive: Fix Codec Detector and Wire Real Export Operations

## Status: READY - Next track available

Text-Driven Editing Core is complete. Fix Codec Detector and Wire Real Export Operations is next.

---

## Last Completed: Text-Driven Editing Core (2026-05-03)

**Track:** Text-Driven Editing Core
**Completed:** 2026-05-03
**Summary:** All 5 phases implemented: Operation interface (Delete, Reorder, InsertSilence, Split), TranscriptMapper with binary search O(log n) lookup, GstSegmentEditor for media operations, context menu UI integration, EditTimeline for export. All tests pass.

**Verification**
- Commit: `137355c feat(edit): implement Text-Driven Editing Core [MiniMax-M2]`
- All edit package tests pass
- Track archived

---

## Upcoming Tracks

- **Track: Fix Codec Detector and Wire Real Export Operations** - Fix the non-functional GstCodecDetector.Detect method so stream-copy exports work, consolidate duplicated path sanitization, and replace simulation stubs in Export/Import/Repair dialogs with real lifecycle calls.
  *Status: Pending. Spec and plan created. Awaiting implementation.*
  *Link: [./tracks/bugfix_codec_detector_real_export_wiring_20260502/](./tracks/bugfix_codec_detector_real_export_wiring_20260502/)*

- **Track: Filler Word Detection UI Integration** - Integrate the existing internal/filler package into the transcript UI: highlight filler words, display a summary panel with counts, and implement one-click removal of individual or all filler words.
  *Status: Pending. Spec and plan created. Awaiting implementation.*
  *Link: [./tracks/feature_filler_word_ui_integration_20260502/](./tracks/feature_filler_word_ui_integration_20260502/)*