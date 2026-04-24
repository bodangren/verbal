# Specification: Feature - VirtualizedWordContainer Integration

## Overview

Replace the non-virtualized `WordContainer` in `EditableTranscriptionView` with the virtualized `VirtualizedWordContainer` to handle recordings with 5000+ words efficiently. The `VirtualizedWordContainer` uses a widget pool and viewport-based rendering to keep memory usage bounded regardless of word count.

## Functional Requirements

1. **Virtualized Word Rendering**
   - Use `VirtualizedWordContainer` instead of `WordContainer` in `EditableTranscriptionView`
   - Pre-allocate widget pool of 100 `WordLabel` widgets at construction
   - Render only visible words based on scroll position (viewport-based rendering)
   - Use binary search for O(log n) word lookup by timestamp

2. **Selection Mode Parity**
   - `EditableTranscriptionView` calls `VirtualizedWordContainer.SetSelectionMode(true/false)`
   - `ClearSelection`, `GetSelection`, `HasSelection` delegate to `VirtualizedWordContainer`
   - Selection UI (selected CSS class on `WordLabel`) works correctly in virtualized context

3. **Segment Building Parity**
   - `GetSelectedSegments()` continues to work with `VirtualizedWordContainer`
   - Build segments from selected range using original word timestamps

4. **Click-to-Seek Parity**
   - `VirtualizedWordContainer.SetWordClickHandler` wired to existing seek callback
   - `EditabletranscriptionView.SetExportRequestedHandler` continues to work

## Non-Functional Requirements

1. **Performance**
   - Memory usage stays bounded at ~100 widgets regardless of word count
   - Scroll remains smooth at 60fps for 10000+ word recordings
   - No GTK object creation during scroll events (widget pool reuse)

2. **Backward Compatibility**
   - Existing `EditableTranscriptionView` API unchanged
   - All existing tests pass without modification

## Acceptance Criteria

1. `EditableTranscriptionView` uses `VirtualizedWordContainer` internally
2. Word container in `EditableTranscriptionView` returns `*VirtualizedWordContainer` via `GetWordContainer()`
3. Selection mode, segment building, and export work identically to previous implementation
4. All existing `EditableTranscriptionView` tests pass
5. `VirtualizedWordContainer` tests continue to pass
6. Full test suite passes (`make go-check`)

## Out of Scope

- Changes to `PlaybackWindow` (already uses `EditableTranscriptionView` polymorphically)
- Changes to `VirtualizedWordContainer` implementation (already complete per bugfix track)
- CSS/style changes to word labels
- Changes to scroll synchronization behavior