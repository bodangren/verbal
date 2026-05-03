# Plan: Fix Codec Detector and Wire Real Export Operations

**Status:** COMPLETED
**Created:** 2026-05-02
**Completed:** 2026-05-03
**Focus:** Fix the non-functional GstCodecDetector.Detect method so stream-copy exports work, consolidate duplicated path sanitization, and replace simulation stubs in Export/Import/Repair dialogs with real lifecycle calls.

---

## Phase 1: Fix GstCodecDetector

- [x] Write failing test for `GstCodecDetector.Detect` with a real MP4/H264 file (use mock/fakes for headless CI where needed).
- [x] Write failing test for `decodebin` `pad-added` signal connection and `GstCaps` inspection.
- [x] Implement `pad-added` signal handler that reads caps, extracts video/audio codec names, and populates `CodecInfo`.
- [x] Handle EOS gracefully: distinguish between "no streams found" and "detection complete".
- [x] Verify `CodecInfo.CanStreamCopy()` returns true for H264/H265/VP8/VP9 and false for AV1/unknown.
- [x] Run `internal/media` tests and verify pass.

## Phase 2: Consolidate Path Sanitization

- [x] Create `internal/media/sanitize.go` with unified `QuoteLocation(path string) string`.
- [x] Write failing tests for sanitization: newlines (`\n`, `\r`), quotes, spaces, unicode, empty paths.
- [x] Implement function using `strconv.Quote()` after stripping newlines.
- [x] Replace `escapeFilePath` in `export.go` with unified function.
- [x] Replace `quoteLocation` in `waveform/generator.go` with unified function.
- [x] Replace `quoteLocation` in `thumbnail/gstreamer_extractor.go` with unified function.
- [x] Run `go vet ./...` and full build to verify no regressions.

## Phase 3: Wire Real Export in ExportDialog

- [x] Write failing test for `ExportDialog.SetOnExport` invoking real export with correct `recordingID`.
- [x] Remove sleep-loop simulation from `showExportDialog` in `cmd/verbal/main.go`.
- [x] Fetch recording from `RecordingRepository` by ID inside export callback.
- [x] Call `GstCodecDetector.Detect` on source file; choose stream-copy or re-encode path.
- [x] Wire `SegmentExporter` with progress callback updating dialog progress bar.
- [x] Surface export errors in dialog message label instead of silent return.
- [x] Run UI/dialog tests and verify pass.

## Phase 4: Wire Real Import in ImportDialog

- [x] Write failing test for `ImportDialog` calling actual `ImportArchive` with ZIP manifest.
- [x] Remove simulation stub from `showImportDialog` in `cmd/verbal/main.go`.
- [x] Implement real import flow: open ZIP, validate manifest version and SHA-256 checksums, extract files.
- [x] Handle duplicate conflicts using enum (`DuplicateSkip`, `DuplicateReplace`, `DuplicateRename`).
- [x] Update library view after successful import.
- [x] Run import lifecycle tests and verify pass.

## Phase 5: Wire Real Repair in RepairDialog

- [x] Write failing test for `RepairDialog` calling `DatabaseRepairer` with real `ThumbnailGenerator`.
- [x] Remove simulation stub from `showRepairDialog` in `cmd/verbal/main.go`.
- [x] Integrate `thumbnail.GstreamerExtractor` into `DatabaseRepairer` initialization.
- [x] Implement real repair flow: validate DB integrity, regenerate missing thumbnails, fix orphaned records.
- [x] Surface repair results (items fixed, failures) in dialog summary.
- [x] Run full test suite: `make go-check`.
- [x] Update `tech-debt.md` and `lessons-learned.md`.
- [x] Update this plan and `measure/tracks.md` with results.
