# Track: Bugfix - Waveform GStreamer Path Sanitization

**Goal:** Fix security vulnerability in waveform package where file paths are interpolated into GStreamer pipelines without sanitization.

**Priority:** Medium severity (from tech-debt.md) - path injection vulnerability

**Type:** Bugfix / Security

**Created:** 2026-04-16
**Completed:** 2026-04-16

---

## Overview

The waveform package had a security issue where file paths were directly interpolated into GStreamer pipeline strings without proper sanitization or quoting. This could potentially allow command injection if malicious file paths were processed.

## Issues Fixed

1. **generator.go:getDuration()** (line ~123): `filesrc location=%s` - direct path interpolation
2. **gstreamer_extractor.go:runExtractionPipeline()** (line ~67): `filesrc location=%s` - direct path interpolation in both input and output paths

## Implementation Completed

### Phase 1: Add quoteLocation Helper and Apply to Generator ✓
- [x] Add `quoteLocation()` function to `generator.go`
- [x] Apply sanitization to `getDuration()` pipeline string
- [x] Add unit tests for the sanitization
- [x] Verify existing tests still pass

### Phase 2: Apply Sanitization to GStreamerExtractor ✓
- [x] `quoteLocation()` function reused from generator.go (same package)
- [x] Apply sanitization to `runExtractionPipeline()` for both input and output paths
- [x] Verify existing tests still pass

### Phase 3: Integration and Verification ✓
- [x] Run full test suite - all pass
- [x] Run go vet - passes
- [x] Run build verification - succeeds
- [x] Update tech-debt.md to mark issue as resolved

## Test Coverage

- Unit tests for `quoteLocation()` function covering:
  - Simple paths
  - Paths with spaces
  - Paths with quotes
  - Paths with newlines (stripped)
  - Paths with carriage returns (stripped)
  - Empty paths
  - Paths with special characters

## Changes Made

### internal/waveform/generator.go
- Added imports: `strconv`, `strings`
- Added `quoteLocation()` function (lines 258-263)
- Updated `getDuration()` to use `quoteLocation(filePath)`

### internal/waveform/gstreamer_extractor.go  
- Updated `runExtractionPipeline()` to use `quoteLocation()` for both input and output paths

### internal/waveform/generator_test.go
- Added `TestQuoteLocation` with 9 test cases

## Quality Metrics
- Test Coverage: maintained
- Race Detector: N/A (no concurrent changes)
- Full Test Suite: Pass
- Build: Pass
- go vet: Pass

## Acceptance Criteria

- [x] All file paths sanitized before GStreamer pipeline interpolation
- [x] quoteLocation() function has unit tests
- [x] Test coverage maintained
- [x] go vet passes
- [x] Full test suite passes
- [x] Build succeeds
- [x] tech-debt.md updated
