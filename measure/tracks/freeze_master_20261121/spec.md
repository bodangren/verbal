# Specification: Freeze Master and Cut List

## Overview

`freezeMaster` maps a transcript's removals onto a cut list, anchor index, and fingerprint, but nothing calls it from the app: the cleanup review's *Freeze master* control is hidden, and no endpoint renders the cleaned media. Worse, `freezeMaster` builds its cut list only from the accepted proposals it is handed, ignoring `transcript.removedWordIds` — the removals a user already saved — so freezing the current document would resurrect deleted words.

## Goals

1. Freezing honours every removal in the document, not only freshly reviewed proposals.
2. `POST /api/cleanup/freeze` freezes the project's current transcript and returns the cut list, anchors, and fingerprint.
3. The review's *Freeze master* control works from the page and reports the result.
4. The frozen metadata is persisted so a later storyboard render can detect a stale anchor set.

## Non-Goals

- Re-rendering or re-anchoring an existing storyboard against a new fingerprint (follow-up track).
- Stream-copy optimisation of the freeze export.
- Freezing from unsaved acceptance state: acceptance is applied to the document first, then saved; freeze always reads the stored transcript.

## Functional Requirements

### FR1: Removals are the document's
- `freezeMaster` merges `transcript.removedWordIds` with the word spans of `accepted` proposals.
- A word removed in the document and re-proposed is counted once.
- `removedWordIds` in the result is in transcript word order and includes both sources.

### FR2: Endpoint
- `POST /api/cleanup/freeze { root }` returns `{ master }` computed from the stored transcript and its probed duration.
- No transcript or no media is `404`; a relative root is `400`; another method is `405`.

### FR3: Page
- *Freeze master* calls the endpoint and reports the master duration and anchor count.
- Failures surface the API message.

## Acceptance Criteria

- [ ] Unit tests prove stored removals and accepted proposals both reach the cut list, counted once.
- [ ] The endpoint returns a cut list and anchors for a project with a transcript and media.
- [ ] `npm run check` passes; the walkthrough still passes.

## Dependencies

- `freezeMaster`, `buildCutList`, `probeMedia` (complete).
- Cleanup review acceptance (complete, previous track).

## Risks

- Anchors are only meaningful once the master is rendered; the fingerprint is what protects a later render from silently mismatching.
