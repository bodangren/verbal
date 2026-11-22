# Specification: Transcript as a Document

## Problem

The transcript is a row of buttons, one tab stop per word. Arrow keys do nothing.
The keyboard cannot make a selection; only Shift-click can. A drag does not select.
A removed word is a disabled button, so it cannot be focused, selected, or restored except by Undo.
The active word does not scroll into view during playback. The selection has a border only.
The edit tools sit in a footer row under the text, far from the selection.
See [the UX review](../../review-ux-2026-11-22.md), findings U03, U04, U08, and U10,
and the target screen `target-edit.jpg`.

## Goals

1. Edit the transcript like a word processor: caret, keyboard selection, drag selection.
2. Keep removed words visible, selectable, and restorable.
3. Put the edit tools next to the selection.
4. Keep the spoken word in view during playback.
5. Show each paragraph's start time.

## Non-Goals

- Typing new words or correcting the transcript text. Text correction needs its own spec.
- Speaker detection. A speaker label shows only when the document carries one.
- The waveform timeline. `ux_timeline_playback_20261122` owns it.
- Changes to the existing editing operations in `packages/core`. FR3 adds one pure `restoreRange`.

## Functional Requirements

### FR1: One focus target

- The transcript is one tab stop with `role="textbox"`, `aria-multiline="true"`, and `aria-readonly="true"`. Words are spans.
- The caret word has `aria-activedescendant`. The caret shows as a 2px indigo bar before the word.
- Left and Right move the caret by one word. Up and Down move by one line. Home and End go to the paragraph ends. Ctrl+Home and Ctrl+End go to the document ends.
- Shift with a movement key extends the selection from the anchor.
- Ctrl+A selects all words. Escape clears the selection.
- Removed words take part in caret movement and selection.

### FR2: Mouse selection

- Click puts the caret on a word and seeks the player.
- Drag across words selects them. Shift-click extends from the anchor.
- Double-click selects the word. Triple-click selects the paragraph.

### FR3: Edit keys and restore

- Delete or Backspace removes the selected kept words as one undo step.
- When the selection holds only removed words, Delete or Backspace restores them as one undo step.
- Ctrl+Z, Ctrl+Shift+Z, and Ctrl+Y work while the transcript has focus.
- Space plays or pauses when the transcript has focus and no text field has focus.
- Alt+Up and Alt+Down move the selected block earlier or later.

### FR4: Selection toolbar

- A floating toolbar shows above the selection: Delete (or Restore), Move Earlier, Move Later, Insert Silence, Split.
- It flips below when there is no room above. It stays inside the stage.
- It is a `role="toolbar"` with arrow-key movement between its buttons. Each button shows its shortcut in its title.
- Labels match the reorder track: Move Earlier and Move Later.
- The silence length input sits in the toolbar as a small field with a default of 1.0 s.
- The footer edit row is removed. Undo and Redo move to the inspector history (`ux_edit_inspector_20261122`).
- The Save button is removed. Autosave stays. Ctrl+S saves now.

### FR5: Reading view

- Each paragraph starts with its start time in mono, `text-secondary`.
- A speaker label shows when the segment has one.
- The active word is an indigo pill per `DESIGN.md`.
- The selection uses an indigo tint background and a thin indigo border per `DESIGN.md`.
- Removed words use a line-through at 4.5:1 contrast or more.
- During playback the active word scrolls into view with `block: "nearest"`. Manual scroll pauses the follow for 3 s.
- Under `prefers-reduced-motion`, the scroll is instant.

### FR6: Size

- A 5,000-word transcript renders and responds to a caret key in under 50 ms on this machine.
- Paragraphs use `content-visibility: auto`.

## Acceptance Criteria

- The UX gate counts 1 tab stop for the transcript (baseline in the review: one per word).
- An e2e step selects 3 words with Shift+Right twice from the caret and deletes them with one key: 4 key presses after focus.
- An e2e step drags across 4 words and finds 4 selected words.
- An e2e step selects a removed word and restores it with Backspace; the word loses `data-removed`.
- An e2e step plays from 20 s and finds the active word inside the stage scroll box.
- An e2e step presses Space on the transcript and finds the media playing.
- The selection toolbar has `role="toolbar"`, and each button has a name and a shortcut title.
- A unit benchmark with 5,000 words keeps a caret move under 50 ms.
- `npm run check`, `npm run e2e`, and the UX gate pass.

## Dependencies

- `ux_gates_20261122` for the gate.
- `ux_shell_flow_20261122` for the stage layout and the pane alert.

## Risks

- `aria-activedescendant` support varies across screen readers. Test with Orca on GNOME.
- Drag selection can fight native text selection. Set `user-select: none` on words during a drag only.
- Restore by Delete is a new rule. The toolbar label changes to Restore to make it clear.
- Move Earlier and Move Later change only text order until `edit_timeline_integrity_20261122` lands (F02).
  The toolbar shows them, but the inspector must not claim the media follows until then.

## Verification

Use the walkthrough fixtures and a generated 5,000-word transcript.
Use the shared heavy runner for the build and the browser.
Never call a paid API.
