# Current Directive: Text-Driven Editing Core

## Status: READY - Next track available

Media Package Test Coverage track is complete. Text-Driven Editing Core is next.

---

## Last Completed: Media Package Test Coverage (2026-05-03)

**Track:** Media Package Test Coverage
**Completed:** 2026-05-03
**Summary:** Phase 1-2 complete: Expanded device and export test coverage. Pipeline tests skipped (require hardware/display). Coverage at 41%. Tech-debt updated with insight about GstCodecDetector non-functional status. Track archived.

**Verification**
- Commit: `a4c0ec7 chore(measure): complete Media Package Test Coverage track [MiniMax-M2]`
- All tests pass, go vet clean
- Track archived

---

## Upcoming Tracks

- **Track: Text-Driven Editing Core** - Implement core text-driven media editing operations: delete word, delete sentence, reorder text, insert silence, and split paragraph. This is the central value proposition of Verbal.
  *Status: Pending. Spec and plan created. Awaiting implementation.*
  *Link: [./tracks/feature_text_driven_editing_core_20260502/](./tracks/feature_text_driven_editing_core_20260502/)*

- **Track: Fix Codec Detector and Wire Real Export Operations** - Fix the non-functional GstCodecDetector.Detect method so stream-copy exports work, consolidate duplicated path sanitization, and replace simulation stubs in Export/Import/Repair dialogs with real lifecycle calls.
  *Status: Pending. Spec and plan created. Awaiting implementation.*
  *Link: [./tracks/bugfix_codec_detector_real_export_wiring_20260502/](./tracks/bugfix_codec_detector_real_export_wiring_20260502/)*

- **Track: Filler Word Detection UI Integration** - Integrate the existing internal/filler package into the transcript UI: highlight filler words, display a summary panel with counts, and implement one-click removal of individual or all filler words.
  *Status: Pending. Spec and plan created. Awaiting implementation.*
  *Link: [./tracks/feature_filler_word_ui_integration_20260502/](./tracks/feature_filler_word_ui_integration_20260502/)*