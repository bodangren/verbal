# Specification: Multi-Range Delete & Reorder

## Overview

This track extends the MVP text-driven delete operation to support multi-range selections, sentence/paragraph-level deletion, reordering paragraphs, inserting silence, and splitting segments. It turns the single-word proof-of-concept into a practical, document-style editing workflow.

## Goals

1. Delete multiple words, a sentence, or an entire paragraph from the transcript.
2. Reorder paragraphs by dragging or cut-and-paste in the transcript.
3. Insert silence at a chosen insertion point.
4. Split a paragraph into two independent segments.
5. Export a new media file that reflects all edits while preserving sync.

## Non-Goals

- Real-time preview of edits during playback (post-MVP).
- Full undo/redo history stack (separate roadmap track).
- Word-level reorder inside a sentence (scope is paragraph/segment reorder).

## Functional Requirements

### FR1: Multi-Range Selection
- User can select a contiguous range of words, a sentence, or a paragraph.
- Selection is represented as one or more `domain.Segment` ranges.

### FR2: Delete Range
- `internal/edit` provides a `DeleteRangeOperation` that removes all selected segments.
- Exported media omits every selected time range and concatenates the remaining pieces.

### FR3: Reorder Paragraphs
- User can move a paragraph before or after another paragraph.
- `internal/edit` provides a `ReorderOperation` that reorders transcript blocks and their associated media segments.
- Exported media reflects the new order.

### FR4: Insert Silence
- User can place the cursor between words and insert a configurable duration of silence.
- `internal/edit` provides an `InsertSilenceOperation`.
- Export pipeline generates a silent audio/video segment of the requested length.

### FR5: Split Paragraph
- User can split a paragraph at the cursor position.
- `internal/edit` provides a `SplitOperation`.
- The transcript and exported media treat the two halves as separate blocks.

### FR6: Edit List & Export
- An edit session is a list of operations applied in order.
- `internal/edit/service.go` applies the edit list and exports the resulting media.
- Stream-copy is used where possible; re-encode fallback is supported.

## Acceptance Criteria

- [ ] `DeleteRangeOperation` removes multiple segments and exports correct media.
- [ ] `ReorderOperation` reorders paragraphs and exports media in the new order.
- [ ] `InsertSilenceOperation` inserts a silent segment of the requested duration.
- [ ] `SplitOperation` splits a paragraph into two blocks.
- [ ] Edit list applies operations deterministically and preserves word-level metadata.
- [ ] Pipeline supports multiple cuts/inserts with stream-copy and re-encode fallbacks.
- [ ] `make check` passes.
