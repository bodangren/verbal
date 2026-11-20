# Specification: Reorder Text

## Overview

Reorder is the last unimplemented operation in the product's v1 editing table. Every other text operation keeps word order, so the document, the cut list, and the anchor index all assume it; moving a word is the first edit that changes which media plays first, and it has to stay a pure document operation that the existing render path already understands.

## Goals

1. `moveRange(transcript, fromIndex, toIndex, targetIndex)` moves an inclusive word block.
2. Segments stay consistent with the new word order.
3. The action is reachable for the selected range and is one undo step.

## Non-Goals

- Drag-and-drop: keyboard/button moves first, since the model is what matters.
- Reordering scenes or slides (storyboard track).
- Re-timing words to their new neighbours: moving text changes playback order, and the exported cut list follows the document's order. Gap-aware retiming is a later refinement.
- Undo/redo (already provided by the history).

## Functional Requirements

### FR1: Semantics
- The block is the inclusive range `fromIndex..toIndex`; it is inserted so its first word ends up at `targetIndex` in the resulting word order, clamped to `[0, words.length - blockLength]`.
- `targetIndex` equal to `fromIndex`, or strictly inside the range, is a no-op returning the same document.
- A range that is out of bounds, inverted, or non-integer throws `TranscriptError("out-of-range")`.
- Word ids, texts, and timestamps are preserved; only the array order changes.

### FR2: Segments
- Moved words join the segment of the block's first word (its new neighbour's segment when the block crosses a boundary), so a sentence stays a sentence.
- Every segment's `wordIds` is rewritten to match the new global order, and no segment is left empty: an emptied segment is dropped.
- Segment ids are unchanged, so selection and styling survive the move.

### FR3: Editor and page
- With a non-empty selection, the transcript panel offers *Move earlier* and *Move later*, moving the selection by one word.
- Both apply through `useTranscriptDocument` as one history entry.
- The selection follows the moved block, so repeated presses keep working.

## Acceptance Criteria

- [ ] Unit tests cover a move forward, a move backward, clamping, no-op cases, bad ranges, and segment rewrites including a boundary crossing.
- [ ] The page moves a selection earlier and later, and undo restores the order.
- [ ] `npm run check` and `npm run e2e` pass, with the walkthrough moving a word and undoing it.

## Dependencies

- Transcript model, `TranscriptError`, segment structure (complete).
- `useTranscriptDocument` history and selection plumbing (complete).

## Risks

- Moving words makes the transcript's timings non-monotonic, so playback highlighting can jump. That is inherent to reordering text without re-timing, and the playback track already reads words in document order; the walkthrough pins the behaviour rather than pretending otherwise.
