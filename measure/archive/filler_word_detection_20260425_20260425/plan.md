# Filler Word Detection - Implementation Plan

## Phase 1: Core Infrastructure & Types
- [x] Create `internal/filler/filler.go` with FillerWord struct and Type enum
- [x] Create Detector interface with Detect method
- [x] Write unit tests for FillerWord struct
- [x] Verify: `go build ./internal/filler/...`

## Phase 2: Built-in Pattern Detection
- [x] Implement DefaultDetector with built-in filler word list
- [x] Add short filler detection (um, uh, hm, mm, ah, er)
- [x] Add hesitation pattern detection (like, you know, I mean, etc.)
- [x] Write tests for all detection patterns
- [x] Verify: `go test ./internal/filler/... -v`

## Phase 3: Repetition Detection
- [x] Implement repetition detection within time window (2 seconds)
- [x] Add tests for repetition patterns
- [x] Verify: tests pass

## Phase 4: Configurable Detection
- [x] Add Config struct with sensitivity options (EnableShortFillers, EnableHesitation, EnableRepetition)
- [x] Update DefaultDetector to respect config
- [x] Write config tests
- [x] Verify: all tests pass

## Phase 5: Integration & Polish
- [x] Update tech-debt.md
- [x] Update lessons-learned.md
- [x] Final verification: `make go-check`
- [x] Commit and push

## Verification
- `go build ./...` - pass
- `go test ./...` - pass (all 12 packages including filler)
- `go vet ./...` - pass