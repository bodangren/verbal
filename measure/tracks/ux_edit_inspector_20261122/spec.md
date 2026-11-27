# Specification: Edit Inspector and Cleanup Review

## Problem

The Edit inspector holds only Cleanup. It does not show the selection, the cuts, or the kept duration.
Cleanup proposals show ids, confidence, and a "Cover" field, but a click on a proposal does not show it in the transcript.
After Remove Accepted, the copy says "Save the transcript to keep it", but autosave already saves.
Undo and Redo are footer buttons with no history.
"Freeze master" sits in Cleanup with no explanation.
See [the UX review](../../review-ux-2026-11-22.md), findings U16 and U17,
and the target screen `target-edit.jpg`.

## Goals

1. Show what is selected and what the edit has cut, in timecodes.
2. Make cleanup a short review: one card, a count, and a review list tied to the transcript.
3. Show the undo history and let the user step back to a named point.
4. Remove copy that contradicts autosave.

## Non-Goals

- New cleanup detectors, LLM proposals, or audio fixes.
- A change to the freeze algorithm. Its label and its place are a decision for Daniel (see Risks).
- The waveform timeline.

## Functional Requirements

### FR1: Selection card

- With a selection, the card shows start and end in `hh:mm:ss.cc` mono, the duration, and the word count.
- With only a caret, it shows the caret word and its time.
- With no transcript, the card is hidden.
- Times are source times until `export_fidelity_20261127` gives edited times. The label says "Source time".

### FR2: Edit summary

- The card shows the number of cuts (contiguous removed runs), the removed duration, and the kept duration.
- A pure function computes the summary from the transcript. It has unit tests.
- The kept duration label says "Estimated" until the compiled timeline exists (F01, F02).

### FR3: Cleanup card and review list

- One card per category with a count: "Filler Words · 14 Found", "Stutters · 2 Found", "Repetitions · 1 Found".
- Review opens a list in the inspector. Each row shows the words in context with the proposal struck through.
- A click on a row selects the words in the transcript, scrolls to them, and seeks the player.
- Each row has a checkbox named by its words, for example "Remove “um” at 0:12".
- The aggressiveness slider has a visible value and `aria-valuetext`.
- "Remove N" applies the checked rows as one undo step. The status says "Removed N words". No save hint.
- Confidence shows as a word: High, Medium, or Low. The proposal id and "Cover" move to a details line.

### FR4: Undo history

- The inspector lists the last 20 edits, newest first, with a label and the time of the first word.
  Labels: Deleted “…”, Restored “…”, Moved “…” Earlier, Inserted 1.0 s Silence, Split Paragraph, Removed N Cleanup Words.
- A click on an entry undoes or redoes to that point as one step.
- Undo and Redo buttons sit at the top of the list with their shortcuts in their titles.
- The history labels come from the editing hook. A pure function makes a label from an edit.

### FR5: Freeze

- The freeze control moves out of Cleanup into a collapsed "Advanced" section of the inspector.
- A one-line description says what it does in plain words.
- The result shows as text in the section, not only in the status bar.

## Acceptance Criteria

- An e2e step selects 3 words and finds their start, end, and duration in the selection card.
- An e2e step deletes 2 runs and finds "2 Cuts" and a kept duration that drops by the removed time.
- An e2e step opens the filler review, clicks a row, and finds those words selected in the transcript.
- An e2e step removes all fillers and undoes once; every filler word is back.
- An e2e step clicks the third history entry and finds the document at that point.
- No text on the page says "Save the transcript to keep it".
- Each checkbox in the review has a name made of its words and time.
- `npm run check`, `npm run e2e`, and the UX gate pass.

## Dependencies

- `ux_gates_20261122` for the gate.
- `ux_transcript_document_20261122` for the selection model and `restoreRange`.

## Risks

- "Freeze master" is Daniel's term. A rename needs his decision. This track keeps the term and adds a description.
- History jumps over many steps can be slow on long transcripts. The history keeps documents, not diffs; measure it.
- Kept duration is only an estimate until F01 and F02 are fixed. The label must say so.

## Verification

Use the walkthrough fixtures and the fake ASR.
Use the shared heavy runner for the build and the browser.
Never call a paid API.
