# Implementation Plan: Chore - Build Optimization

## Phase 1: Create Makefile with Build Targets

### Tasks
- [x] Create Makefile with go-build, go-vet, go-test targets
- [x] Add GOCACHE environment variable to enable persistent caching
- [x] Add help target documenting available commands

## Phase 2: Configure Incremental Build

### Tasks
- [x] Set GOCACHE to ~/.cache/go-build (standard Go cache location)
- [x] Add GOFLAGS for incremental compilation
- [x] Verify incremental build speed improvement (5.7s cached vs >2min cold)

## Phase 3: Add Check Target

### Tasks
- [x] Add make check target running vet, build, test in sequence
- [x] Add CI mode support for single-run checks

## Phase 4: Documentation

### Tasks
- [x] Document caching in AGENTS.md build system section
- [x] Verify all targets work correctly