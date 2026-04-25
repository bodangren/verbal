# Implementation Plan: Bugfix - VirtualizedWordContainer Fixes

## Context

Three bugs in VirtualizedWordContainer require fixes:
1. UpdateVisibleWidgets only Appends widgets without ever removing old ones, causing unbounded FlowBox growth
2. SetHighlightedWord indexes into pool by word index, but pool slots don't map 1:1 to word indices with virtualization
3. UpdateVisibleWidgets reads vwc.words without holding lock, creating a data race

## Phase 1: Fix UpdateVisibleWidgets Widget Removal

### Tasks

1.1 [ ] Add test `TestUpdateVisibleWidgets_ClearsOldWidgets` that calls UpdateVisibleWidgets multiple times and verifies FlowBox child count doesn't grow

1.2 [ ] Modify UpdateVisibleWidgets IdleAdd callback to call `flowBox.RemoveAll()` or iterate and remove children before appending new ones

1.3 [ ] Run test to verify FlowBox stays bounded

### Exit Criteria
- Test passes
- go test ./internal/ui/... passes
- go build ./... passes

## Phase 2: Fix SetHighlightedWord Semantic Mapping

### Tasks

2.1 [ ] Add field `highlightedPoolIdx int` to VirtualizedWordContainer to track which pool slot is highlighted

2.2 [ ] Modify SetHighlightedWord to:
  - Calculate which pool slot corresponds to the highlighted word (based on current scroll position)
  - Clear previous highlighted pool slot
  - Set new highlighted pool slot

2.3 [ ] Add test `TestSetHighlightedWord_WithVirtualization` that scrolls to different positions and verifies highlighting works correctly

### Exit Criteria
- Test passes
- go test ./internal/ui/... passes
- go build ./... passes

## Phase 3: Fix Data Race in UpdateVisibleWidgets

### Tasks

3.1 [ ] Add race detector test `TestUpdateVisibleWidgets_NoRace` using t.Parallel() or explicit synchronization

3.2 [ ] Snapshot words under lock before binary search:
  - In UpdateVisibleWidgets, after locking, copy `words` to a local variable
  - Pass this snapshot to firstVisibleWordIndex and lastVisibleWordIndex (as receiver or parameter)

3.3 [ ] Run `go test -race ./internal/ui/...` to verify no races

### Exit Criteria
- Race detector passes
- go test -race ./internal/ui/... passes
- go build ./... passes

## Phase 4: Integration Verification

### Tasks

4.1 [ ] Run full test suite: `go test ./... -count=1`

4.2 [ ] Run build: `go build ./...`

4.3 [ ] Run vet: `go vet ./...`

4.4 [ ] Update tech-debt.md to mark items as resolved

4.5 [ ] Update lessons-learned.md with any new patterns discovered

4.6 [ ] Commit checkpoint with git note