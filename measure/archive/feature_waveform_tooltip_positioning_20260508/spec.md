# Spec: WaveformWidget Tooltip Positioning

**Track ID:** feature_waveform_tooltip_positioning_20260508
**Created:** 2026-05-08
**Status:** In Progress

## Problem

The `WaveformWidget.ShowTooltip` method accepts `mouseX, mouseY` parameters but doesn't use them to position the tooltip popup window. The tooltip appears at its default location rather than following the cursor.

## Solution

Modify `ShowTooltip` to position the tooltip window at the provided `mouseX, mouseY` coordinates, or alternatively use the widget's `TranslateCoordinates` to get screen-relative position and position the tooltip accordingly.

## Acceptance Criteria

1. Tooltip appears at cursor position when hovering over waveform
2. Tooltip follows cursor as it moves
3. Tooltip stays within visible bounds of the waveform widget
4. No visual glitches when tooltip repositioned rapidly