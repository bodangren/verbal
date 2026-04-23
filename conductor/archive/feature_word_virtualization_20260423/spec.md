# Specification: Word Virtualization for Long Recordings

## Problem

The current `EditableTranscriptionView` creates all word `Label` widgets upfront in a `FlowBox`. For very long recordings (1+ hours), this creates thousands of GTK widgets, causing:
- High memory usage
- Slow initial rendering
- UI lag during scrolling

## Solution

Implement virtualization so only visible words are rendered as widgets. Words outside the visible viewport are represented as lightweight data structures, not GTK widgets.

## Design

1. **VirtualizedFlowBox**: A custom container that renders only visible words
   - Tracks scroll position and viewport dimensions
   - Calculates which words are visible based on word timestamps and scroll offset
   - Only creates GTK widgets for visible words
   - Recycles/reuses widget pool as user scrolls

2. **Data/Widget Separation**:
   - `Word` struct (data) contains: `Text`, `StartTime`, `EndTime`, `Index`
   - Widget layer only created on demand for visible range

3. **Scroll/Time Mapping**:
   - Each word has a start/end time
   - Viewport time range = `[scrollOffset * duration, (scrollOffset + visibleRatio) * duration]`
   - Binary search to find first visible word
   - Linear scan for last visible word (typical 10-50 words in viewport)

4. **Widget Pool**:
   - Pre-allocate a fixed pool of word labels (e.g., 100)
   - On scroll, detach labels from old positions and reattach to new visible words
   - No per-scroll widget creation/destruction

5. **Integration**:
   - Drop-in replacement for current `EditableTranscriptionView`
   - Same public API: `SetWords()`, `SetHighlightedWord()`, `ClearHighlight()`
   - Existing tests should pass (interface preserved)

## Acceptance Criteria

- [ ] VirtualizedFlowBox renders only visible words (not all words)
- [ ] Scrolling updates visible word set without creating new widgets
- [ ] Highlighting works for words in visible set
- [ ] Words outside visible viewport are NOT rendered as labels
- [ ] Memory usage stays bounded regardless of recording length
- [ ] Existing tests pass with no modifications
- [ ] Binary search finds first visible word efficiently
- [ ] Widget pool reuses labels efficiently on scroll

## Technical Notes

- Viewport height / average word height ≈ visible widget count
- For 1-hour recording at 150 wpm ≈ 9000 words
- With 50 visible widgets, only 0.5% of words are widgetized at any time
- Use `gtk.ScrolledWindow` viewport signals to detect scroll changes
- Pool size should be ~2x visible count for smooth scrolling buffer
