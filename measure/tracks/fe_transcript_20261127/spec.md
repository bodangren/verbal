# Spec: Frontend Transcript as a Document

Source: Fable frontend review of 2026-11-27 (F06, F07, F08, F09, F17) at `c6dc3f4`. The older `ux_transcript_document_20261122` spec is archived and rolled into this one.

## Problem

- **F06.** The transcript has 200 tab stops and 15 more precede it (`TranscriptEditor.tsx:78-127`). The gate counts word elements as tab stops and tests for a focused word, so no fix passes it (`ux-gates.mjs:303-318`).
- **F07.** A removed word is a disabled button, and `reset` drops the history. After a reload nothing restores it, and `packages/core/src/transcript.ts` has no restore function.
- **F08.** "Transcribe Again" replaces an edited transcript with no confirm step (`IngestStage.tsx:139-147`, `index.tsx:950-975`).
- **F09.** Delete gives no message and focus falls to `<body>`. Inserted silence has no mark. Search does not scroll to the match, the first Next selects match 2, and Enter in the search field does nothing (`index.tsx:931-943,1095-1102`).
- **F17.** `Home` holds about 75 state values; each word click renders every word. 5,000 words: 9,506 DOM nodes, 9-14 ms per selection (29-49 ms at 4x CPU).

## Requirements

1. FR1. The transcript container is one tab stop (`role="listbox"`, `tabIndex=0`, `aria-activedescendant`). Each word is a `role="option"` span. Keys: Arrow, Shift+Arrow, Home/End, Ctrl+A, Escape, Delete/Backspace, Space.
2. FR2. The `.segmented` mode control is one tab stop with a roving `tabIndex`. The stage comes first in the DOM; CSS `order` keeps the visual order.
3. FR3. The gate counts tab stops by walking the real tab order and tests focus on the container. Targets: at most 6 stops before the transcript and at most 3 inside it.
4. FR4. `restoreRange` is a pure core function and one undo step. A removed word shows `aria-disabled`, a strike style, and a Restore action that works after a reload.
5. FR5. Delete moves focus to the next kept word and announces `Removed N words`. A silence shows as a chip from `transcript.silences`.
6. FR6. Selection changes call `scrollIntoView({ block: "nearest" })`. Search selects match 1 on input; Enter and Shift+Enter move next and previous.
7. FR7. "Transcribe Again" asks to confirm when the transcript has edits and names what is lost.
8. FR8. `Word` is memoized, the match set is precomputed, and `.transcript__segment` has `content-visibility: auto`. A 5,000-word test shows one selection renders at most the changed words.

## Acceptance

- The UX gate passes the tab-stop budgets (6 before, 3 inside).
- A keyboard-only test deletes, restores, and undoes a range without a mouse.
- A 5,000-word render benchmark test fails on `c6dc3f4` and passes after.
