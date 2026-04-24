# Track: Bugfix - VirtualizedWordContainer Fixes

## Status: Planned

## Created: 2026-04-24

## Summary

Fix three bugs in VirtualizedWordContainer:
1. UpdateVisibleWidgets never removes old widgets from FlowBox (unbounded growth)
2. SetHighlightedWord incorrectly indexes pool by word index (semantic mismatch)
3. UpdateVisibleWidgets has a data race on the words slice

## Tech Debt Items Addressed

- `VirtualizedWordContainer.UpdateVisibleWidgets never removes old widgets from FlowBox` - severity: medium
- `VirtualizedWordContainer.SetHighlightedWord indexes pool by word index` - severity: medium
- `VirtualizedWordContainer.UpdateVisibleWidgets has data race on words slice` - severity: medium

## Implementation Plan

### Phase 1: Fix UpdateVisibleWidgets Widget Removal

- [ ] Clear FlowBox children before appending new ones
- [ ] Add test to verify FlowBox doesn't grow unbounded

### Phase 2: Fix SetHighlightedWord Semantic Mapping

- [ ] Track highlighted pool slot (not word index)
- [ ] Update to highlight the currently-visible pool slot
- [ ] Add test for scroll + highlight interaction

### Phase 3: Fix Data Race in UpdateVisibleWidgets

- [ ] Snapshot words under lock before binary search calls
- [ ] Add race detector test
- [ ] Run full test suite with -race

### Phase 4: Integration Verification

- [ ] Full test suite passes
- [ ] Build passes
- [ ] Vet passes
- [ ] Race detector clean (`go test -race ./internal/ui/...`)