# Plan: WaveformWidget Tooltip Positioning

**Status:** COMPLETE
**Created:** 2026-05-08
**Focus:** Fix tooltip positioning to follow cursor

---

## Phase 1: Analyze Current Implementation

- [x] Read WaveformWidget waveform.go to understand tooltip initialization
- [x] Read ShowTooltip/HideTooltip methods
- [x] Understand how motion events are wired

## Phase 2: Implement Position Tracking

- [x] Add translateToScreen helper method
- [x] Remove SetHAlign/SetVAlign from initTooltip (popup positioning)
- [x] Modify ShowTooltip to call Move() with screen coordinates
- [x] Write test for translateToScreen
- [x] Run go vet ./internal/ui/...
- [x] Run go test ./internal/ui/...

## Phase 3: Integration and Testing

- [x] Update tech-debt.md to mark tooltip positioning as resolved
- [x] Commit and push