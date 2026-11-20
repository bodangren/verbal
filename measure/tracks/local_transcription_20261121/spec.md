# Specification: Local Offline Transcription

## Overview

Transcription requires an `OPENAI_API_KEY` and sends the media to a cloud API, which is the one part of Verbal that is not local-first. A whisper-class CLI already produces word-level timestamps on disk; this track adds it as a second provider behind the existing abstraction, chosen by an environment switch.

## Goals

1. A provider that shells out to a whisper CLI as an argv array.
2. Parsing that CLI's word-level JSON into the existing `TranscriptionResult`.
3. Selection between cloud and local through one environment switch, with no UI change.
4. A clear, surfaced failure when the binary is missing.

## Non-Goals

- Downloading or managing models: the CLI and its model are prerequisites the user installs.
- Bundling a binary or shipping weights.
- Streaming/real-time transcription.
- Changing the batch or single-project routes: both already go through `createTranscribeService`.

## Functional Requirements

### FR1: Provider
- `createLocalWhisperProvider({ binary?, modelPath?, run? })` returns a `TranscriptionProvider` whose `id` is `local-whisper`.
- Invocation is an argv array (`-m <model> -f <file> -oj -of <stem>`), never a shell string; every user-supplied path is passed as its own argument.
- A non-zero exit or a missing output file becomes an `AiError("request-failed")` carrying the CLI's message.
- A missing binary becomes `AiError("not-configured", ...)` naming the binary, so the API layer answers 503 like a missing key.

### FR2: Parsing
- `parseWhisperJson(raw)` accepts the CLI's object form with `transcription[]` entries carrying `text`, `offsets.from`, `offsets.to` (milliseconds) and returns `{ text, language, words }`.
- Entries with empty text are skipped; a non-finite offset fails as `AiError("invalid-response")`.
- An empty transcription yields zero words rather than throwing, and the caller decides what an empty transcript means.

### FR3: Selection
- `VERBAL_ASR=local` selects the local provider; anything else keeps the cloud provider.
- With the local provider selected, `OPENAI_API_KEY` is not required.
- With `VERBAL_ASR=local` and no binary available, the request fails with a message that names the binary, not a generic error.

## Acceptance Criteria

- [ ] Unit tests cover the argv builder, the JSON parser, and provider failure modes against a fake runner.
- [ ] A test exercises the fake binary end to end through the provider (a script that writes JSON).
- [ ] Service selection is tested for both switch values.
- [ ] `npm run check` passes; the walkthrough still passes with the cloud (fake ASR) provider.
- [ ] The spec states plainly that the real binary path is unverified on this machine.

## Dependencies

- `TranscriptionProvider` abstraction and `createTranscribeService` (complete).
- `AiError` mapping in `apps/web/server/api-errors.ts` (`not-configured` → 503).

## Risks

- Whisper CLI JSON shapes differ between forks; the parser targets the `transcription[]`/`offsets` shape and fails loudly rather than silently returning no words.
- A large model on CPU is slow; progress is coarse until the CLI streams, which this track does not attempt.
