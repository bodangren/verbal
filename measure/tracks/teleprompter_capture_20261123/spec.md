# Specification: Webcam Recording with Teleprompter

## Problem

A take is recorded by the server today. `POST /api/capture` takes a typed duration,
opens `/dev/video0` with FFmpeg `-f v4l2` and PulseAudio with `-f pulse`, and writes one
`assets/capture-*.mp4` that becomes the project's only media. The browser preview is a
separate `getUserMedia` stream, so the preview and FFmpeg contend for the camera; on most
Linux systems the second consumer cannot stream. The preview is stopped only after the job
finishes. There is no manual stop, no prompter, and no way to keep a good first take while
re-recording one flubbed line. See `apps/web/server/capture-api.ts`,
`packages/media/src/capture.ts`, and `apps/web/components/CapturePanel.tsx`.

## Goals

1. Record the webcam from the same browser stream the preview shows, with a live preview,
   a countdown, and manual start/stop.
2. Show a per-project script in a top-center teleprompter overlay close to the lens.
3. Transcribe each take and align it to the script's sentence beats.
4. Propose initial edits (keep, cut, reread) with the LLM, on demand, after showing the
   provider and cost.
5. Let the user reread only the bungled beats, with the rest of the script dimmed for context.
6. Assemble the kept ranges into an EDL and render it on preview or export.
7. Keep capture, normalization, and assembly local; keep cloud STT/LLM opt-in.

## Non-Goals

- Green-screen keying changes. The take is still recorded un-keyed and keyed at composite time.
- Multi-camera switching, live streaming, or remote guests.
- A general non-linear editor; the EDL is script-ordered.
- Transcript text correction; `ux_transcript_document_20261122` owns the transcript model.
- Automatic publishing or distribution.
- Paid provider calls in tests or without explicit approval.

## Decisions (2026-11-23)

- **Capture:** browser `MediaRecorder` from the `getUserMedia` stream; FFmpeg normalizes the
  upload to MP4. One camera consumer, live preview, exact manual stop. Recorded in
  `tech-stack.md`.
- **Script:** per-project `script.md`; paste/type, plus **Use Transcript**.
- **Retakes:** STT each take, align it to the script, let the LLM propose initial edits; the
  user rereads bungled beats.
- **Prompter:** overlay near the top center, so the reader looks close to the lens.
- **Final cut:** an EDL in `assembly.json`; render on preview or export.
- **LLM review:** on demand, with provider and cost shown first.
- **Beats:** one sentence or script line per beat.
- **Reread view:** full script with the good beats dimmed.

## Functional Requirements

### FR1: Studio capture

- The Ingest **Record** action opens a Studio card: live preview, prompter, script editor.
- `getUserMedia` feeds both the preview and the recorder. Camera and microphone are chosen
  from `enumerateDevices`; the choice persists in localStorage.
- MediaRecorder MIME negotiation: `video/webm;codecs=vp9,opus`, then `vp8,opus`, then
  `video/mp4`; a clear error when none is supported.
- **Record** runs a 3-2-1 countdown, then starts the prompter scroll and the recorder together.
- **Stop** stops both, uploads the blob to `POST /api/takes`, and normalizes it to
  `takes/<id>.mp4` (H.264/AAC, 48 kHz) as a job.
- A take is capped at 30 minutes; elapsed time and a microphone level meter are visible.
- `beforeunload` warns while recording or uploading.
- Errors (permission, no device, upload, normalize) route to the Ingest pane.

### FR2: Script and prompter

- `script.md` lives at the project root. `GET/PUT /api/script` reads and writes it atomically;
  a missing file is an empty script.
- **Use Transcript** fills the script from the project's current transcript.
- The script splits into **beats** on sentence endings or script lines, with stable ids.
  Word count and an estimated read time (150 WPM) are shown.
- The prompter is a translucent band near the top center of the preview: 2-4 lines, large
  type, a fixed reading guide, and controls for speed (WPM), font size, mirror, play/pause,
  and reset.
- Keyboard, scoped to the Studio: Space play/pause, Up/Down speed, +/- font, M mirror,
  Home reset. The scrolling view is `aria-hidden`; the script textarea stays accessible.
- Under `prefers-reduced-motion`, the scroll advances by line instead of animating.

### FR3: Take transcription and alignment

- After normalization, the take is transcribed with word timestamps and saved as
  `takes/<id>.transcript.json`.
- Local ASR is the default; cloud ASR is used only when configured and opted in, and the
  provider is named.
- A deterministic aligner normalizes both texts (lower case, punctuation removed, numbers
  expanded) and runs a Needleman-Wunsch alignment. It maps each script beat to take word
  ranges and reports per-beat coverage and confidence.
- Beats are marked Good, Bungled, Skipped, or Improvised. No LLM is required for this step.
- The user can override any status.

### FR4: LLM initial edit

- The review runs on demand. The provider and an estimated cost are shown before any call.
- The prompt carries the beats and the aligned take text with timestamps. The response is
  JSON: `{ "beats": [{ "id", "action", "reason", "source": { "startSeconds", "endSeconds" } }] }`.
- Validation: known beat ids, `keep | cut | reread`, ranges inside the take, no overlap,
  non-decreasing order. Invalid items fall back to `keep`.
- Proposals appear in a review list and are accepted or rejected individually. Nothing is
  applied silently. The list follows the `PatchReview` pattern.

### FR5: Reread

- From the review, **Reread** one beat or **Reread All Marked**.
- The Studio opens with the full script, the good beats dimmed, positioned at the first marked
  beat, with the usual countdown.
- The reread take is transcribed and aligned from that beat. The beat's source switches to the
  reread.
- A worse reread can be discarded; the previous source returns.

### FR6: Assembly

- `assembly.json` holds an ordered EDL: `{ takeId, startSeconds, endSeconds }` for each kept
  beat, with a 100 ms handle on each side.
- FFmpeg cuts the ranges (`buildVideoRangeArgs`) and concatenates them on preview or export.
- The assembled transcript is the kept beats' words with shifted timestamps, so Edit, cleanup,
  and export keep working.
- The player can preview the EDL. **Render Assembled Preview** materializes a file.
- `project.media` points at the active take; export uses the EDL.

### FR7: Safety and privacy

- Uploads are validated: byte cap, MIME and extension, project-root containment, atomic rename.
- FFmpeg is invoked with argv arrays only; no shell interpolation.
- Cloud ASR/LLM are opt-in; the UI states that audio or text leaves the machine.
- Deleting a take removes its media, transcript, and manifest entry.

### FR8: Lifecycle

- Takes and the script survive a reload. The existing session restore reopens the project.
- A failed normalize, STT, or LLM step leaves the take in place and shows an inline error with
  Retry and Dismiss.

## Acceptance Criteria

- A take records after a countdown and stops manually; the take plays in Edit.
- The script persists across a reload.
- A take with one flubbed beat yields a review that marks it; a reread replaces that beat; the
  assembled EDL uses the reread.
- LLM proposals are reviewable and never silently applied.
- Export renders the EDL; preview plays it.
- No paid call runs in tests; e2e uses a fake media stream.
- `npm run check`, `npm run e2e`, and the UX gate pass.

## Dependencies

- `ux_shell_flow_20261122` for the Ingest stage and the pane alert. Complete.
- `local_safety_20261122` for upload and loopback validation. Implement equivalent validation
  in this track if the safety track has not landed.
- `edit_timeline_integrity_20261122` for cut fidelity. Coordinate the EDL with the compiled
  timeline.
- `job_lifecycle_20261122` for cancellation and events. The existing registry suffices for v1.
- `packages/ai` for ASR and LLM.

## Risks

- Codec support varies across browsers. Negotiate and always normalize with FFmpeg.
- ASR errors cause false bungles. Use alignment confidence and a manual override.
- The LLM can hallucinate cuts. Validate against beat ids and source ranges, and require review.
- Assembly seams can clip or jump. Add handles, offer a short crossfade, and preview the EDL.
- Long takes and uploads can fail. Cap the length, upload in chunks, and guard `beforeunload`.
- Cloud ASR/LLM cost and privacy. Opt in, show provider and cost, and keep local as the default.
- Headless e2e has no camera. Use Chrome's fake media device and a fake normalize job.

## Verification

Use unit tests for beats, alignment, review schema, and the EDL. Use component tests for the
prompter, Studio, and review. Use server tests with a fake spawner and a fake provider for
upload, normalize, STT, and the review API. Use the walkthrough with
`--use-fake-device-for-media-stream` for the browser path. Never call a paid API.
