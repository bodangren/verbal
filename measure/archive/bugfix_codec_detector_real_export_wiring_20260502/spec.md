# Specification: Fix Codec Detector and Wire Real Export Operations

## Problem

1. **GstCodecDetector is non-functional:** The codec detection pipeline in `internal/media/codec.go` sets up a `decodebin` but never connects to its `pad-added` signal to inspect caps. It always returns an error ("EOS received"), which forces the export pipeline to fall back to full re-encoding. This renders the recently completed Export Pipeline Optimization track ineffective—stream-copy is never used in practice.
2. **Path sanitization is duplicated and inconsistent:** `escapeFilePath` in `export.go`, `quoteLocation` in `waveform/generator.go`, and `quoteLocation` in `thumbnail/gstreamer_extractor.go` all perform similar but slightly different sanitization. This increases maintenance burden and the risk of inconsistent security behavior.
3. **Export/Import/Repair dialogs use simulation stubs:** `showExportDialog`, `showImportDialog`, and `showRepairDialog` in `cmd/verbal/main.go` simulate progress with `time.Sleep` loops instead of calling actual lifecycle operations. The `ExportDialog`'s `SetOnExport` callback ignores the `recordingID` parameter and does not perform real exports.

## Requirements

- `GstCodecDetector.Detect` must correctly inspect `GstCaps` from `decodebin` pad-added signals and return valid `CodecInfo`.
- Stream-copy export must be exercised when source and output codecs match (H264, H265, VP8, VP9).
- All path sanitization must be consolidated into a single utility in `internal/media` or `internal/util`.
- `ExportDialog` must call real `SegmentExporter` with the selected `recordingID`.
- `ImportDialog` must call real archive import with ZIP manifest parsing and duplicate handling.
- `RepairDialog` must call `DatabaseRepairer` with real `ThumbnailGenerator` integration.

## Acceptance Criteria

- [ ] `GstCodecDetector.Detect` returns correct `CodecInfo` for MP4/H264 test files.
- [ ] Stream-copy path is used in export when codec parameters allow it.
- [ ] Single unified `QuoteLocation()` function replaces all existing sanitization variants.
- [ ] Export dialog performs real exports with progress callbacks and error surfacing.
- [ ] Import dialog performs real imports with manifest validation and duplicate resolution.
- [ ] Repair dialog performs real repair with thumbnail regeneration.
- [ ] `go test ./...`, `go build ./...`, and `go vet ./...` all pass.
- [ ] `tech-debt.md` and `lessons-learned.md` are updated with any new patterns.
