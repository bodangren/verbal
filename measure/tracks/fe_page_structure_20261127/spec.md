# Spec: Frontend Page Structure

Source: Fable frontend review of 2026-11-27 (F17, F18, F19) at `c6dc3f4`.

## Problem

- **F17.** `Home` holds about 75 state values. Each active word, each job poll (500 ms) and each prompter tick (100 ms) renders the whole page (`index.tsx:236-355,1935`).
- **F18.** `index.tsx` has 2,576 lines. Three tests mount it. None covers delete and undo, move, silence, search, or the shortcuts.
- **F19.** Duplicate `setRendering(false)` calls (`index.tsx:1374-1375,1401-1402`).

## Requirements

1. FR1. Extract `EditWorkspace`, `DeliverWorkspace`, `IngestWorkspace`, `useStudio` and one `api-client` module from `index.tsx`. Behaviour does not change.
2. FR2. Studio state (prompter tick, recording) lives in `useStudio`, so a prompter tick does not render `Home`.
3. FR3. Job polling state lives in one hook; a poll tick renders only its consumers.
4. FR4. Page-level tests cover: delete and undo, move, silence insert, search, and the keyboard shortcuts.
5. FR5. `index.tsx` is under 600 lines.

## Acceptance

- Every task keeps `npm run check` and `npm run e2e` green.
- A render counter test shows a prompter tick and a job poll render `Home` zero times.
