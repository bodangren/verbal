# Specification: Multi-Track Toggle Fix

## Overview
Fix the incomplete multi-track toggle implementation in the Timeline Visualization Integration track. The toggle button exists but doesn't actually control segment/track visibility in the WaveformWidget.

## Problem
Phase 4 tasks (32-35) of the Timeline Visualization Integration track were marked complete despite being incomplete:
- Multi-track toggle button exists in PlaybackWindow toolbar
- SetMultiTrackToggleCallback callback is defined
- But the callback doesn't control WaveformWidget segment visibility

## Goals
1. Add track visibility state to WaveformWidget
2. Add SetTrackVisibility method to WaveformWidget
3. Wire multi-track toggle callback to control waveform segment visibility
4. Ensure tests verify the behavior

## Technical Approach
- Add `tracksVisible bool` field to WaveformWidget struct
- Add `SetTrackVisibility(visible bool)` method to WaveformWidget
- Modify drawSegments to only draw when tracksVisible is true
- Wire PlaybackWindow.SetMultiTrackToggleCallback to call WaveformWidget.SetTrackVisibility

## Acceptance Criteria
1. Toggle button activates/deactivates segment visibility on waveform
2. SetTrackVisibility method exists on WaveformWidget
3. Tests verify track visibility state behavior
4. Build succeeds with no errors