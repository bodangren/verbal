# Specification: Filler Word Detection UI Integration

## Overview

The `internal/filler` package provides `DefaultDetector` for identifying filler words ("um", "uh", "like", "you know") and repetition patterns in transcription data, but it is not yet integrated into the application UI. The product vision explicitly lists "Filler Word Detection" as a key feature: "Identify and remove 'ums,' 'ahs,' and dead air via AI-driven transcript analysis." This track surfaces filler detection to users and enables removal workflows.

## Requirements

- **Detection Service:** A `FillerService` that wraps `DefaultDetector`, runs detection on transcription data, and caches results per recording.
- **Visual Highlighting:** Filler words rendered in `EditableTranscriptionView` must use a distinct CSS class (e.g., amber/orange) that is visually distinguishable from the current playback highlight (GNOME blue).
- **Summary Panel:** A GTK widget showing counts by category: short fillers (um/uh), discourse markers (like/you know), repetitions, and dead air. Include "Jump to Next Filler" navigation.
- **One-Click Removal:** Users can remove an individual filler word or all detected fillers from a recording. Removal performs a time-range cut on the media.
- **Progress Feedback:** Batch "Remove All" operations show a progress dialog since they may invoke media re-encoding.
- **Menu Integration:** Add "Detect Fillers" to the Tools menu with a keyboard shortcut (`Ctrl+Shift+F`).

## Acceptance Criteria

- [ ] `FillerService` exists in `internal/filler` with tests for detection + caching.
- [ ] Filler words are visually highlighted in `EditableTranscriptionView` with WCAG AA contrast.
- [ ] `FillerSummaryWidget` displays accurate counts and navigation controls.
- [ ] Individual filler removal cuts the correct time range and refreshes the transcript.
- [ ] "Remove All Fillers" batch operation works with progress feedback.
- [ ] Tools menu includes "Detect Fillers" action with keyboard shortcut.
- [ ] `go test ./...`, `go build ./...`, and `go vet ./...` all pass.
- [ ] `tech-debt.md` and `lessons-learned.md` are updated with any new patterns.
