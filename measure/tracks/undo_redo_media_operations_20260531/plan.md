# Plan: Undo/Redo System for Text-Driven Media Operations

## Phase 1: Operation History Stack

### Tests First
- [ ] Test `NewHistoryStack` with max depth
- [ ] Test `Push` adds operation and increments pointer
- [ ] Test `Push` drops oldest when exceeding max depth
- [ ] Test `Undo` returns last operation and decrements pointer
- [ ] Test `Redo` returns next operation and increments pointer
- [ ] Test `Undo` at bottom returns nil
- [ ] Test `Redo` at top returns nil
- [ ] Test `Clear` resets stack
- [ ] Test `CanUndo` / `CanRedo` reflect state correctly
- [ ] Test pointer consistency after push→undo→push (redo buffer cleared)

### Implementation
- [ ] Create `internal/editor/history.go` with `HistoryStack` struct
- [ ] Store `[]Operation` slice and `pointer int`
- [ ] Implement Push, Undo, Redo, Clear, CanUndo, CanRedo
- [ ] Add `History()` method returning copy for persistence

## Phase 2: Operation Marshal/Unmarshal for Persistence

### Tests First
- [ ] Test `MarshalOperation` round-trip for each operation type
- [ ] Test `UnmarshalOperation` handles unknown type gracefully
- [ ] Test history serialization to JSON

### Implementation
- [ ] Add `MarshalJSON() ([]byte, error)` to Operation interface
- [ ] Add `UnmarshalOperation(data []byte) (Operation, error)` factory
- [ ] Register concrete types in factory map
- [ ] Store history as JSON blob in auto_save table or new column

## Phase 3: GTK TextView Integration

### Tests (Manual QA)
- [ ] Ctrl+Z triggers undo
- [ ] Ctrl+Shift+Z (or Ctrl+Y) triggers redo
- [ ] GTK built-in undo doesn't conflict (disable TextView native undo)
- [ ] Undo updates both transcript text and media timeline
- [ ] Redo restores state after undo

### Implementation
- [ ] Add `ConnectKeyController` to main TextView
- [ ] Intercept Ctrl+Z / Ctrl+Y before TextView native handler
- [ ] Call `history.Undo()` / `history.Redo()` and re-apply operations
- [ ] Update `PlaybackWindow` timeline position after undo/redo
- [ ] Add undo/redo buttons to toolbar

## Phase 4: Integration with Auto-Save

- [ ] Include history stack in auto-save snapshot
- [ ] Restore history on crash recovery
- [ ] Add `history` column to `auto_save` table (or use JSON)
- [ ] Run `go test ./internal/editor/...`
- [ ] Manual verification: delete→undo→redo→save→reload→undo
- [ ] Update `measure/tech-debt.md` and `measure/lessons-learned.md`
- [ ] Commit and push
