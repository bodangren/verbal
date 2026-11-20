# Plan: Transcript Search and Navigation

## Phase 1: Search Engine (TDD)
- [ ] Write tests for TranscriptSearch
- [ ] Implement binary-search-based word matching with highlight ranges
- [ ] Handle multi-word phrase matching across word boundaries
- [ ] Tests pass

## Phase 2: UI Integration
- [ ] Add SearchBar widget to EditableTranscriptionView
- [ ] Wire highlight ranges into VirtualizedWordContainer
- [ ] Add result count label
- [ ] Add Ctrl+G / Ctrl+Shift+G accelerators
- [ ] Tests pass

## Phase 3: Navigation and Polish
- [ ] Implement jump-to-match with auto-scroll
- [ ] Ensure search works with virtualized rendering
- [ ] Escape to clear search
- [ ] Manual verification

## Phase 4: Verification
- [ ] Full test suite pass
- [ ] Build and vet clean
- [ ] Update lessons-learned.md
- [ ] Commit and push
