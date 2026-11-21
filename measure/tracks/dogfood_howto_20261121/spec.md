# Specification: Dogfood How-To Videos

## Why this exists

Verbal exists to make videos by editing text, but it has never been used to make
the thing it sells: a how-to. Driving a real recording through the product as a
user would is the fastest way to find the UX gaps that unit tests and a
happy-path walkthrough cannot see.

## What "dogfood" means here

1. Record a real session of the app performing a how-to task.
2. Bring a recording into a project and work on it in the app.
3. Publish the how-to and log every point of friction.
4. Fix the friction that blocks or misleads a first-time user.

## Constraint (recorded honestly)

This machine has no `OPENAI_API_KEY` and no `whisper` binary, so **real
transcription is unavailable**. The dogfood fixture writes a scripted transcript
(the narration timings) through the public API. That exercises playback,
selection, editing, cleanup and delivery; transcription itself is out of scope
until a provider exists. Every video produced this way is marked as using a
scripted transcript.

## Deliverables

- `tools/dogfood/record-howto.mjs` — a reproducible viewport recorder: prepares
  a fixture project, drives the UI, records the browser, and writes a session
  manifest with step timings.
- `tools/dogfood/compose-howto.mjs` — burns the step captions into an MP4 with
  FFmpeg.
- One how-to MP4 (first cut) and the UX issue log in this track.
- Fixes for the issues that block a first run.

## Acceptance

- The recorder produces a video from a clean run with one command.
- The how-to MP4 plays, and each caption matches what is on screen.
- Every issue found is logged with severity and either fixed or explicitly
  deferred.
- `npm run check` and `npm run e2e` stay green.

## Out of scope

Real ASR, voiceover, distribution, public hosting.
