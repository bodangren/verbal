# Implementation Plan: Build Time Optimization

## Contract & Schema Definition

- [ ] Task: Analyze current build structure
  - [ ] Run `go list ./...` to understand package hierarchy
  - [ ] Identify which packages have CGo dependencies (UI, media, waveform)
  - [ ] Document import graph

- [ ] Task: Benchmark baseline build times
  - [ ] Clean build test: `go clean -cache && time go build ./...`
  - [ ] Incremental build test: `time go build ./...`
  - [ ] Vet test: `time go vet ./...`

- [ ] Task: Investigate build strategies
  - [ ] Check if sccache or ccACHE can help with CGo
  - [ ] Test Go version and available build flags
  - [ ] Review if split packages is feasible

## Test

- [ ] Task: Create benchmark tests for build time
  - [ ] Document current build time in test file
  - [ ] Verify tests still pass with current configuration

## Implement

- [ ] Task: Implement chosen optimization strategy
  - [ ] Apply configuration changes
  - [ ] Update Makefile if needed

- [ ] Task: Verify optimization effectiveness
  - [ ] Re-run benchmark tests
  - [ ] Compare against baseline

## Generate Docs & Doctor

- [ ] Task: Update documentation
  - [ ] Update lessons-learned.md with build optimization findings
  - [ ] Document any new build flags or environment variables

- [ ] Task: Run doctor checks
  - [ ] Run `measure doctor` to validate project health