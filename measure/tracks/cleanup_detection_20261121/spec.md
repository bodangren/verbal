# Specification: Cleanup Detection and Review

## Overview

The cleanup package already models proposals (grouping, acceptance, aggressiveness) and `CleanupReview` renders them, but nothing ever produces a proposal and the component is not on the page. This track adds a deterministic local detector for the word-level cleanup patterns and makes the review — and its removal — reachable in the UI.

## Goals

1. Detect filler words, stutters, and immediate repetitions from the transcript, as pure functions.
2. Expose the proposals through an API so the page can show them.
3. Render the review on the page and remove the accepted proposals through the existing transcript editing path.
4. Keep every removal explicit: nothing is deleted without a decision.

## Non-Goals

- **Dead air** — silence is a media property, not a word span. Trimming it belongs with the cut list when the master is frozen; accepting it by deleting the neighbouring word would be wrong.
- **Audio fixes (hum, rumble, level)** — these need spectral analysis of the audio; the review already renders them, so the API returns an empty list until an analyser exists.
- **LLM cleanup proposals** — the deterministic detector is enough to make the feature usable, and it works offline. Provider-based proposals come later.
- **Freezing the master** — cut list, anchors, and the rendered cleaned master are the next track.
- Auto-removal without review.

## Functional Requirements

### FR1: Detection
- `detectProposals(transcript, options?)` returns `CleanupProposal[]` ordered by `fromIndex`.
- **Filler:** a word whose normalised text is in a conservative list (`um`, `uh`, `erm`, `er`, `ah`, `hmm`, `mm`, `uhh`, `umm`) — case- and punctuation-insensitive. Confidence `0.95`, cover `punch-in`.
- **Stutter:** the same normalised word repeated immediately two or more times. The repeats (not the first) are proposed. Confidence `0.9`, cover `punch-in`.
- **Repetition:** an immediately repeated bigram ("I think I think"). The second bigram is proposed. Confidence `0.8`, cover `cutaway`.
- Already-removed words are ignored and are never proposed.
- A word may appear in at most one proposal; the earliest, most specific category wins (filler before stutter before repetition).
- Ids are stable within a run (`p1`, `p2`, …) so acceptance survives a re-render.
- Options let a caller override the filler list.

### FR2: API
- `GET /api/cleanup?root=<absolute path>` returns `{ proposals, audioFixes }`.
- A project without a transcript is `404`; a relative root is `400`; another method is `405`.

### FR3: Review in the page
- When a transcript is open, a *Cleanup* panel lists the grouped proposals with their words, reason, confidence, and cover.
- Categories and individual proposals are toggled through the existing `Acceptance` model; aggressiveness only changes eligibility.
- **Remove accepted** removes exactly the accepted proposals from the document through `useTranscriptDocument`, marks it dirty, and leaves saving to the explicit *Save transcript* action.
- The panel reports how many proposals are accepted.
- The *Freeze master* button is only rendered when a freeze handler exists, since freezing arrives in a later track.

## Acceptance Criteria

- [ ] Unit tests cover filler, stutter, repetition, ordering, duplicate suppression, and already-removed words.
- [ ] The API returns proposals for a project with a transcript and errors as specified otherwise.
- [ ] The page renders the review, and *Remove accepted* removes the expected words and marks the document dirty.
- [ ] `npm run check` and `npm run e2e` pass.

## Non-Functional Requirements

- Detection is pure, synchronous, and browser-safe (no Node built-ins in `@verbal/cleanup`'s root export).
- No network call: the detector runs on the server against the stored transcript, and the accepted removals go through the existing save path.
- Reuse `resolveAccepted`; no second acceptance engine.

## Dependencies

- `@verbal/cleanup` proposal model, `resolveAccepted`, `groupProposals` (complete).
- `@verbal/core` transcript document (complete).
- `useTranscriptDocument` editing hook and `PUT /api/transcript` (complete, previous track).

## Open Decisions

- **Conservative filler list.** "like" and "you know" are context-dependent and would produce noisy false positives, so they are excluded. A provider-based detector can add them with confidence scores.
- **Detection on request, not on save.** The transcript is the source of truth; proposing on demand keeps edits and proposals from drifting.
- **Cover defaults** are suggestions for the storyboard, not behaviour: `punch-in` for a word-sized cut, `cutaway` for a phrase-sized one.

## Risks

- Repeated words that are intentional ("very, very good") will be proposed. Confidence makes them filterable, and acceptance is explicit, so the cost is a decision rather than a wrong cut.
- The detector's output changes if the transcript changes; ids are only stable within one document revision, which is why acceptance is keyed by id and reviewed before removal.
