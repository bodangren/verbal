# Specification: Transcript Search and Navigation

## Overview

A long transcript can only be scanned by eye: there is no search box, no match count, and no way to jump to a phrase. This track adds a pure search over the transcript and a search box in the editor that highlights matches and steps between them.

## Goals

1. `searchTranscript` finds phrases across word boundaries, case- and punctuation-insensitively.
2. The editor highlights matched words.
3. A search box reports the match count and steps to the next and previous match by selecting it.

## Non-Goals

- Regex or fuzzy search.
- Replacing text (editing is delete-only by design).
- Searching inside removed words, which are not navigable.
- Server-side search: the transcript is already in the browser.

## Functional Requirements

### FR1: Search
- `searchTranscript(transcript, query)` returns match ranges `{ fromIndex, toIndex }` in transcript order.
- Matching is case-insensitive, ignores punctuation, and spans words: the kept words are joined with single spaces and the query is matched as a substring.
- A blank or whitespace-only query returns no matches.
- Removed words are excluded, and a match never includes one; a query that only matches across a removed word therefore does not match.
- Queries longer than the transcript and queries with no match return an empty list.

### FR2: Editor
- `TranscriptEditor` takes `matchedRanges` and marks every word inside one with `data-match="true"`.
- A matched word stays clickable and keeps its removed/selected/active semantics.

### FR3: Page
- The transcript panel has a search field, a match count, and Previous/Next buttons.
- Next/Previous wrap around and select the match they land on, so the existing selection styling shows where the search went.
- With no query, the count is hidden and the buttons are disabled.

## Acceptance Criteria

- [ ] Unit tests cover phrase matching across words, case and punctuation, removed words, blank queries, and no-match queries.
- [ ] Editor tests prove matched words carry `data-match`.
- [ ] `npm run check` and `npm run e2e` pass, with the walkthrough searching a word and stepping matches.

## Dependencies

- Transcript document and `keptWords` (complete).
- `TranscriptEditor` selection support (complete).
