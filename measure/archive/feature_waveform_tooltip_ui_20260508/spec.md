# Specification: WaveformWidget Tooltip UI Integration

## Overview

The WaveformWidget has hover tracking implemented (`SetHoverCallback`, `GetHoverPosition`), but the actual tooltip display requires parent UI integration. This track implements the tooltip popup that shows the timestamp at the hover position.

## Requirements

- Display a GTK tooltip/popup near the cursor when hovering over the waveform
- Show the timestamp (formatted as MM:SS or HH:MM:SS) at the hover position
- Hide the tooltip when the mouse leaves the waveform area
- The tooltip should follow the cursor position within the waveform
- Integration into PlaybackWindow (which contains the WaveformWidget)

## Acceptance Criteria

- [ ] Tooltip popup appears when hovering over WaveformWidget
- [ ] Tooltip displays correct timestamp for hover position
- [ ] Tooltip hides when mouse leaves waveform area
- [ ] Tooltip follows cursor position as it moves
- [ ] `tech-debt.md` updated to mark this item as resolved
- [ ] `lessons-learned.md` updated with any new patterns discovered