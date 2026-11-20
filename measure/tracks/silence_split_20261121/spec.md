# Specification: Insert Silence and Split Segment

## Overview

The product's v1 editing table lists five text operations; Verbal implements delete and reorder is absent, but *insert silence* and *split paragraph* are still unimplemented, so a user who needs a beat of air or a new caption segment must edit JSON by hand. Both are pure document operations over the transcript model and need no media work.

## Goals

1. `insertSilence(transcript, afterWordId, seconds)` inserts air after a word.
2. `splitSegment(transcript, beforeWordId)` starts a new segment at a word.
3. Both are reachable from the editor for the selected word.
4. Undo covers both, through the existing history.

## Non-Goals

- Removing silence (dead-air trimming belongs to the cut list).
- Reordering words, which changes media order and needs its own track.
- Media preprocessing: silence is expressed by gaps in word timestamps, so no audio is generated.

## Functional Requirements

### FR1: Insert silence
- Shifts the `start` and `end` of every word after the anchor by `seconds`, leaving earlier words, ids, and segments untouched.
- `seconds <= 0` or a non-finite value is a no-op returning the same document.
- An unknown anchor word throws `TranscriptError("unknown-word")`.
- The function is idempotent in the sense that applying it again with the same anchor and duration shifts again by exactly that amount (no rounding drift beyond float exactness of the stored values).

### FR2: Split segment
- Splits the segment containing the word so that word begins a new segment; word ids and order are unchanged.
- Splitting at a segment's first word is a no-op returning the same document.
- An unknown word throws `TranscriptError("unknown-word")`.
- New segment ids are unique and deterministic (`s<n>` continuing the existing numbering), so repeated splits never collide.

### FR3: Editor and page
- With a word selected, the transcript panel offers *Insert silence* (with a seconds field) and *Split segment*.
- Both apply through `useTranscriptDocument`, mark the document dirty, and are undoable in one step.
- A failed operation surfaces its message.

## Acceptance Criteria

- [ ] Unit tests cover shifting, no-op cases, unknown words, splitting, and unique ids across repeated splits.
- [ ] The page applies both actions and they are undoable.
- [ ] `npm run check` and `npm run e2e` pass, with the walkthrough inserting silence and splitting a segment.

## Dependencies

- Transcript document model and `TranscriptError` (complete).
- `useTranscriptDocument` history (complete).

## Risks

- Shifting timestamps past the media's duration makes a word unreachable in playback; the operation reports the resulting last-word end so the page can warn instead of silently losing the tail.
