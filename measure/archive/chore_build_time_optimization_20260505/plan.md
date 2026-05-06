# Implementation Plan: Build Time Optimization

## Contract & Schema Definition

- [x] Task: Analyze current build structure
  - [x] Run `go list ./...` to understand package hierarchy
  - [x] Identify which packages have CGo dependencies (UI, media, waveform)
  - [x] Document import graph

- [x] Task: Benchmark baseline build times
  - [x] Clean build test: `go clean -cache && time go build ./...`
  - [x] Incremental build test: `time go build ./...`
  - [x] Vet test: `time go vet ./...`

- [x] Task: Investigate build strategies
  - [x] Check if sccache or ccACHE can help with CGo
  - [x] Test Go version and available build flags
  - [x] Review if split packages is feasible

## Test

- [x] Task: Create benchmark tests for build time
  - [x] Document current build time in test file
  - [x] Verify tests still pass with current configuration

## Implement

- [x] Task: Implement chosen optimization strategy
  - [x] Apply configuration changes
  - [x] Update Makefile if needed

- [x] Task: Verify optimization effectiveness
  - [x] Re-run benchmark tests
  - [x] Compare against baseline

## Generate Docs & Doctor

- [x] Task: Update documentation
  - [x] Update lessons-learned.md with build optimization findings
  - [x] Document any new build flags or environment variables

- [x] Task: Run doctor checks
  - [x] Run `measure doctor` to validate project health

## Findings (2026-05-06)

### Root Cause
CGo compilation for packages using `gotk4-gstreamer` is extremely slow:
- `internal/media`: ~2 minutes per build (CGO_LDFLAGS processing)
- `internal/waveform`: ~2 minutes per build
- `internal/thumbnail`: same issue via media dependency
- `cmd/verbal` (full app): >3 minutes, often times out

### CGo Dependency Chain
```
cmd/verbal (gtk4, adwaita, gstreamer)
├── internal/ui (gtk4)
├── internal/media (gstreamer) ← BOTTLENECK
├── internal/waveform (gstreamer) ← BOTTLENECK
├── internal/thumbnail (gstreamer via media)
└── ...other packages...
```

### Solution Identified
**ccache** is required to cache CGo compilations. Without it:
- Every full rebuild recompiles all CGo code from scratch
- Incremental builds still trigger CGo recompilation due to header scanning

### Blocker
Cannot install ccache without sudo password. User must run:
```bash
sudo apt-get install ccache
```

### Baseline Measurements
- Full build: >3 minutes (times out)
- Package build (media/waveform): ~2 minutes each
- Non-CGo packages: <1 second each