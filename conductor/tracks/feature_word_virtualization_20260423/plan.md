# Implementation Plan: Word Virtualization for Long Recordings

## Phase 1: VirtualizedWordContainer Core
- [ ] Create `virtualized_word_container.go` with VirtualizedWordContainer struct
- [ ] Add word data storage (no widgets yet)
- [ ] Implement binary search for time-to-index mapping
- [ ] Implement visible range calculation based on scroll position

## Phase 2: Widget Pool
- [ ] Implement widget pool with configurable pool size (~100 labels)
- [ ] Add DetachLabel/AttachLabel methods for widget reuse
- [ ] Connect scroll events to trigger viewport updates

## Phase 3: Visible Word Rendering
- [ ] Implement UpdateVisibleWidgets() to render only visible words
- [ ] Handle scroll with glib.IdleAdd for GTK thread safety
- [ ] Support click-to-seek for visible words

## Phase 4: Integration & Testing
- [ ] Update WordContainer to use virtualization internally (drop-in)
- [ ] Write unit tests for binary search and visible range calculation
- [ ] Ensure existing tests pass
- [ ] Add tests for widget pool recycling

## Verification
- `go test ./internal/ui/... -count=1` - all pass
- `go build ./...` - pass
- `go vet ./...` - pass
