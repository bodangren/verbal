# Plan: Fix Codec Detector and Wire Real Export Operations

**Status:** PENDING  
**Created:** 2026-05-02  
**Focus:** Fix the non-functional GstCodecDetector.Detect method so stream-copy exports work, consolidate duplicated path sanitization, and replace simulation stubs in Export/Import/Repair dialogs with real lifecycle calls.

---

## Phase 1: Fix GstCodecDetector

- [ ] Write failing test for `GstCodecDetector.Detect` with a real MP4/H264 file (use mock/fakes for headless CI where needed).
- [ ] Write failing test for `decodebin` `pad-added` signal connection and `GstCaps` inspection.
- [ ] Implement `pad-added` signal handler that reads caps, extracts video/audio codec names, and populates `CodecInfo`.
- [ ] Handle EOS gracefully: distinguish between "no streams found" and "detection complete".
- [ ] Verify `CodecInfo.CanStreamCopy()` returns true for H264/H265/VP8/VP9 and false for AV1/unknown.
- [ ] Run `internal/media` tests and verify pass.

## Phase 2: Consolidate Path Sanitization

- [ ] Create `internal/media/sanitize.go` with unified `QuoteLocation(path string) string`.
- [ ] Write failing tests for sanitization: newlines (`\n`, `\r`), quotes, spaces, unicode, empty paths.
- [ ] Implement function using `strconv.Quote()` after stripping newlines.
- [ ] Replace `escapeFilePath` in `export.go` with unified function.
- [ ] Replace `quoteLocation` in `waveform/generator.go` with unified function.
- [ ] Replace `quoteLocation` in `thumbnail/gstreamer_extractor.go` with unified function.
- [ ] Run `go vet ./...` and full build to verify no regressions.

## Phase 3: Wire Real Export in ExportDialog

- [ ] Write failing test for `ExportDialog.SetOnExport` invoking real export with correct `recordingID`.
- [ ] Remove sleep-loop simulation from `showExportDialog` in `cmd/verbal/main.go`.
- [ ] Fetch recording from `RecordingRepository` by ID inside export callback.
- [ ] Call `GstCodecDetector.Detect` on source file; choose stream-copy or re-encode path.
- [ ] Wire `SegmentExporter` with progress callback updating dialog progress bar.
- [ ] Surface export errors in dialog message label instead of silent return.
- [ ] Run UI/dialog tests and verify pass.

## Phase 4: Wire Real Import in ImportDialog

- [ ] Write failing test for `ImportDialog` calling actual `ImportArchive` with ZIP manifest.
- [ ] Remove simulation stub from `showImportDialog` in `cmd/verbal/main.go`.
- [ ] Implement real import flow: open ZIP, validate manifest version and SHA-256 checksums, extract files.
- [ ] Handle duplicate conflicts using enum (`DuplicateSkip`, `DuplicateReplace`, `DuplicateRename`).
- [ ] Update library view after successful import.
- [ ] Run import lifecycle tests and verify pass.

## Phase 5: Wire Real Repair in RepairDialog

- [ ] Write failing test for `RepairDialog` calling `DatabaseRepairer` with real `ThumbnailGenerator`.
- [ ] Remove simulation stub from `showRepairDialog` in `cmd/verbal/main.go`.
- [ ] Integrate `thumbnail.GstreamerExtractor` into `DatabaseRepairer` initialization.
- [ ] Implement real repair flow: validate DB integrity, regenerate missing thumbnails, fix orphaned records.
- [ ] Surface repair results (items fixed, failures) in dialog summary.
- [ ] Run full test suite: `make go-check`.
- [ ] Update `tech-debt.md` and `lessons-learned.md`.
- [ ] Update this plan and `measure/tracks.md` with results.
