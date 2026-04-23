# Implementation Plan: Word Virtualization for Long Recordings

## Phase 1: VirtualizedWordContainer Core
- [x] Create `virtualized_word_container.go` with VirtualizedWordContainer struct
- [x] Add word data storage (no widgets yet)
- [x] Implement binary search for time-to-index mapping
- [x] Implement visible range calculation based on scroll position

## Phase 2: Widget Pool
- [x] Implement widget pool with configurable pool size (~100 labels)
- [x] Add UpdateViewport/UpdateVisibleWidgets methods for widget management
- [x] Connect scroll events to trigger viewport updates

## Phase 3: Visible Word Rendering
- [x] Implement UpdateVisibleWidgets() to render only visible words
- [x] Handle scroll with glib.IdleAdd for GTK thread safety
- [x] Support click-to-seek for visible words

## Phase 4: Integration & Testing
- [x] Update WordContainer to use virtualization internally (drop-in)
- [x] Write unit tests for binary search and visible range calculation
- [x] Ensure existing tests pass
- [x] Add tests for widget pool recycling

## Verification
- `go test ./internal/ui/... -count=1` - all pass
- `go build ./...` - pass
- `go vet ./...` - pass

## Notes
- Widget pool pre-allocates 100 WordLabel instances at construction
- UpdateVisibleWidgets updates pool labels with word data and makes them visible
- Uses glib.IdleAdd for GTK thread safety
- Pool indices map to visible words via startIdx offset
- Selection/highlight state managed via pool index, not word index
