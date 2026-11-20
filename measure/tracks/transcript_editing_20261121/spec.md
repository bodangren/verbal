# Specification: Transcript Editing

## Overview

The transcript renders and seeks, but it cannot be edited from the UI: `removeWord` and `removeRange` exist in the model and nothing calls them. This track makes the product's core promise usable — delete words by editing text, undo it, and save the result.

## Goals

1. Delete a word or a shift-click range from the transcript editor.
2. Undo and redo edits, including keyboard shortcuts.
3. Save the edited transcript to the project, with a visible dirty state.
4. Keep removed words in the document (struck through, disabled) so an edit stays reversible until saved.

## Non-Goals

- Reordering, splitting, and inserting silence (separate track).
- Filler and dead-air detection (separate track).
- Auto-save and crash recovery (separate track).
- Ripple preview of the cut result while editing.

## Functional Requirements

### FR1: Selection
- Clicking a word seeks and selects that single word.
- Shift-clicking extends an inclusive range from the anchor.
- Selected words carry `data-selected="true"` so they can be styled and asserted.

### FR2: Deletion
- A **Delete selection** action removes the selected range.
- With the transcript region focused, `Delete` or `Backspace` performs the same action.
- Deleting with no selection does nothing.
- Removal is idempotent: removing an already-removed word changes nothing.

### FR3: Undo and redo
- **Undo** and **Redo** buttons restore the exact prior document.
- `Ctrl/Cmd+Z` undoes; `Ctrl/Cmd+Shift+Z` and `Ctrl/Cmd+Y` redo.
- A new edit clears the redo stack.

### FR4: Save
- **Save transcript** writes atomically through `PUT /api/transcript`.
- The panel shows *Unsaved changes* while the document differs from the last save, and *Saved* otherwise.
- A failed save surfaces the API error and keeps the dirty state.

### FR5: Persistence
- Removed words survive a page reload once saved: the reopened transcript renders them struck through and disabled.

## Acceptance Criteria

- [ ] Shift-click selects a range and marks the words `data-selected`.
- [ ] Delete selection removes the range and marks the document dirty.
- [ ] Undo restores the words and returns the dirty state to clean when the original state is reached.
- [ ] Redo removes them again; a further edit clears redo.
- [ ] `Delete` on the focused transcript region deletes the selection.
- [ ] Saving and reopening the project shows the removed words struck through.
- [ ] `npm run check` and `npm run e2e` pass.

## Non-Functional Requirements

- Reuse `removeRange` and the generic `History` from `@verbal/core`; no second edit engine.
- No new network call per keystroke; saving is explicit.
- The transcript region is focusable and every control has an accessible name.

## Dependencies

- `@verbal/core` transcript model and history (complete).
- Existing `TranscriptEditor` and the composed page (complete).

## Open Decisions

- **Auto-save:** deferred. Explicit save keeps this track small and the dirty state observable; auto-save belongs to the crash-recovery track.
- **Selection model:** one contiguous range. Multi-range selection is a later track.

## Risks

- Anchor state lives in the editor while the page stores the last reported range; a remount clears the anchor. Acceptable for one range.
- Window-level undo shortcuts could fight text inputs; shortcuts are ignored while an input or textarea has focus (check `event.target`).
