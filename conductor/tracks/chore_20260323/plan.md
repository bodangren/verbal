# Implementation Plan: Chore - Refactor/Cleanup 2026-03-22 Work

## Phase 1: VideoPlayer Double-Seek Fix [checkpoint: c49598b]
- [x] Task: Fix VideoPlayer currentTime sync to prevent double-seek on rapid updates
    - [x] Write Tests: Test debounced external currentTime handling
    - [x] Implement Feature: Add debounce to external currentTime prop updates in VideoPlayer
- [ ] Task: Conductor - User Manual Verification 'Phase 1: VideoPlayer Double-Seek Fix' (Protocol in workflow.md)

## Phase 2: Error Boundary & Code Cleanup
- [ ] Task: Add React error boundary component for graceful error handling
    - [ ] Write Tests: Test error boundary catches and displays errors
    - [ ] Implement Feature: Create ErrorBoundary component and wrap main app
- [ ] Task: Remove unused code and dead branches
    - [ ] Write Tests: Verify existing tests still pass after cleanup
    - [ ] Implement Feature: Remove `void isWordHighlighted` and other dead code
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Error Boundary & Code Cleanup' (Protocol in workflow.md)
