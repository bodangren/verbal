# Track: Undo/Redo System for Text-Driven Media Operations

## Overview

Implement a full undo/redo stack for all text-driven media editing operations in Verbal. Users can delete words, reorder sentences, insert silence, and split paragraphs — then undo and redo any action with standard Ctrl+Z / Ctrl+Y shortcuts.

## Goals

1. Implement an operation history stack with configurable max depth (default 50)
2. Wire undo/redo to all existing Operation types (Delete, Reorder, InsertSilence, Split)
3. Persist undo history in SQLite alongside project state
4. Update transcript and media timeline on undo/redo
5. Provide keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y)

## Non-Goals

- Branching history (non-linear undo)
- Operation grouping / macro recording
- Undo across project switches

## Success Criteria

- All four operation types support undo and redo
- History survives auto-save recovery
- Keyboard shortcuts work in GTK TextView without conflict
- Stack respects max depth (oldest dropped)
- Unit tests cover 100% of history stack logic
