# Specification: Timeline Visualization Integration

## Overview
Wire the EditTimeline from `internal/edit/timeline.go` into the PlaybackWindow UI, implement segment visualization in the waveform area, and add timeline zoom/scroll controls for multi-track editing.

## Background
The Advanced Media Processing track (2026-05-04) implemented core infrastructure:
- `TimestampMapper` for multi-segment timestamp rewriting
- `EditTimeline` for tracking edit operations
- `MultiTrackTimeline` widget (deferred UI wiring)

This track completes the UI integration phase.

## Goals
1. Display edit segments as visual markers on the waveform
2. Add timeline zoom and scroll controls to the waveform area
3. Wire EditTimeline operations to show visual feedback on the timeline
4. Implement multi-track toggle for segment visibility

## Technical Approach
- Extend WaveformWidget to show segment markers (overlay or separate track)
- Add zoom/scroll controls (GTK spin buttons + pan gesture)
- Create a TimelineOverlay widget or extend WaveformWidget for segment visualization
- Wire EditTimeline.ApplyOperation to update timeline visual state
- Use `gtk.Paned` with resizable bottom pane for timeline area

## Acceptance Criteria
1. Waveform shows segment boundaries as vertical markers
2. Zoom in/out buttons or keyboard shortcuts work (Ctrl++/-, Ctrl+0 reset)
3. Scroll offset persists when switching between views
4. Edit operations (delete word/sentence) update the segment visualization
5. Multi-track toggle shows/hides segment tracks
6. All existing tests pass
7. Build succeeds with no errors