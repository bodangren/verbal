# Dogfood Findings — First How-To (2026-11-21)

Made with `tools/dogfood/record-howto.mjs` + `compose-howto.mjs`. The demo
transcript is **scripted**: this machine has no ASR key and no whisper binary.

| # | Severity | Symptom | Cause | Status |
|---|----------|---------|-------|--------|
| 1 | High | The player loses its waveform and the browser logs a **500** for a silent take. | `showwavespic` fails when the input has no audio stream; the endpoint surfaced that as 500. | **Fixed** — the waveform falls back to a flat line and logs the original failure; unit + service tests added. |
| 2 | Medium | The first cut showed the *previous* UI inside the demo video. | The fixture reused the old walkthrough screen recording as demo media. | **Fixed** — the fixture now generates neutral footage with a real audio track. |
| 3 | Low | The how-to brand label covered the app's own title bar. | Composer drew it at `y=26`, inside the app chrome. | **Fixed** — removed the duplicate brand; the scripted-transcript note moved to the bottom-right. |
| 4 | High | Importing a take required typing an absolute file path; the browser listed folders only. | `Source media` was a text field; `/api/fs/list` had no file mode. | **Fixed** — `?includeFiles=1` lists media files, `MediaPicker` browses to one, and the Source media panel has a Browse… button. How-to #2 imports through it. |
| 5 | Medium | Deliver was blank for a fresh project; Fast preview had nothing to plan. | The storyboard starts empty, and the only way to add scenes was raw JSON. | **Fixed** — `storyboardFromTranscript` builds one scene per segment; Deliver's empty state offers **Create storyboard** and then previews it. How-to #3 shows the flow. |
| 6 | Info | Mode buttons and transcript words can share names (`Deliver`), so automation must scope to the navigation. | Chrome and content share the same accessible names. | **Noted** — the recorder scopes to the mode nav; revisit if a real ambiguity appears. |
| 7 | Environment | Transcription cannot be dogfooded here. | No `OPENAI_API_KEY`, no `whisper` binary. | **Recorded** — transcript is scripted; the rest of ingest/edit/deliver is real. |
| 8 | Info | The picker and the project browser both had rows titled `Enter …`, so automation had to scope to the dialog. | The modal sits over a page with the same row titles. | **Noted** — the recorder scopes to `role="dialog"`. |
| 9 | High | The first storyboard (all `talk` scenes) was rejected by export: "storyboard has no renderable scenes". | The exporter only accepted slide/generated scenes. | **Fixed** — talk scenes render as source-video ranges (`-ss`/`-t`) and concatenate with slides. |
| 10 | High | The exported file mixed 96 kHz slide audio with 48 kHz talk audio; concat-copy cannot reconcile that, so the programme would pitch-shift. | The composite AAC defaulted to 96 kHz; the ranges kept the source rate. | **Fixed** — every segment forces 48 kHz; verified. |
| 11 | Medium | The title/outro replayed the first seconds of programme audio, duplicating scene 1. | Brand steps used the speaker audio. | **Fixed** — brand steps render silent (`anullsrc`); verified -91 dB. |
| 12 | Medium | The Export preset in the inspector was ignored by the server. | `startStoryboardExport` read brand/geometry, not `preset`. | **Fixed** — the preset resolves to codecs, forces the container extension, and reaches slides, talk ranges, and the output path. Verified with WebM/VP9. |
| 13 | Low | The output path had to be typed, and the field truncates long paths. | The field started empty and showed the whole path in a narrow input. | **Fixed** — the path is prefilled to `<project>/exports/<name>.<preset extension>` and carries the full path as a title. |
| 14 | Low | A VP9 export sat at "Job running · 0%" for about a minute. | Only a percentage was shown; the assembly never reported per-step progress. | **Fixed** — the export reports "Rendering step N of M", "Concatenating segments" and "Export complete"; the inspector and status bar show the message. |
| 15 | Low | The picker's missing-folder error was raw ("no folder at …") with no next step. | The API message went straight into the alert. | **Fixed** — the alert is followed by "Use Home or Up to keep browsing." |

## What worked well

- The browser → project → Edit path is quick, and the player transport is now
  visible and scrubbable (the clipping fix from the previous turn held up).
- Project rows carry enough metadata (words, media, age) to choose without
  opening each one.
- The auto-save and status bar made the recording feel like a normal app; no
  modal or confirmation interrupted the take.

## Export #1 — Four Talk Scenes (36.0s)

Exported `exports/final-verified.mp4` from the how-to #3 storyboard.

Verified:

- 1280x720 H.264, 36.02s, **48 kHz mono**; six segments (title + four talk
  ranges + outro).
- Title/outro are **silent** (-91 dB mean); scene 1 programme is **-16.5 dB**.
- The first export attempt (before the fixes) mixed 96 kHz and 48 kHz audio and
  could not have played the programme correctly.

## How-To #5 — Fast Export with Prefill and Progress (43s)

`out/howto-export-fast.mp4`: open the project -> Deliver -> the output path is
already filled (`<project>/exports/How to edit a take.mp4`) -> **Export
storyboard** -> the inspector and status bar report "Rendering step 1 of 6",
"Concatenating segments", "Export complete".

Produced: H.264/AAC, 48 kHz mono, 36.0s (`exports/How to edit a take.mp4`).
Findings 13 and 14 are visible fixed. The longer VP9 how-to (#4) is kept for the
preset/extension demonstration.

## How-To #4 — Export with a Preset (13s, trimmed)

`out/howto-export.mp4`: open a storyboard project -> Deliver -> choose **WebM
(VP9)** -> **Export storyboard** -> the job writes `how-to-export.webm`. The
original 77s recording spent a minute at "Job running · 0%"; the shipped cut
drops that idle middle and keeps the preset selection, the first progress, and
the completion (12.96s).

Verified produced file (`out/export-webm-vp9.webm`): VP9/Opus, 1280x720,
**48 kHz mono**, 36.0s.

What surfaced:

- The preset now changes the container and codecs: choosing WebM writes `.webm`
  and the inspector reflects the actual path after the job.
- VP9 is slow; the UI sat at "Job running · 0%" for about a minute, and the
  how-to is 77s because of that wait. Segment progress would help (finding 14).
- The output-path field truncates the filename at 1280px (finding 13).

## How-To #2 — Import Through the Picker (9.8s)

`out/howto-import.mp4`: create a project in the browsed folder → **Browse…** →
enter a folder → choose a file → **Import copy** → the take opens in the player.

What worked well:

- The picker opens where the project browser was, so the last folder is reused.
- Media files are listed without the noise of every other file (extensions only).
- Choosing a file fills the source field and leaves the user in control of
  *Import copy*; no surprise copy.
- Import lands in Edit with the player showing the take, even though there is no
  transcript yet.

## How-To #3 — Deliver's First Storyboard (8.6s)

`out/howto-deliver.mp4`: open a transcript project → Deliver shows **No scenes
yet** → **Create storyboard** → four scenes (one per segment) → preview → export.

What worked well:

- The empty state names the next action instead of offering a preview that can
  only plan nothing.
- Creating the storyboard is one click; the preview follows without a second
  step.
- The scene list shows source (Speaker) and time ranges, so the result is
  inspectable before export.

## What the next dogfood run should try

1. Add export segment progress (finding 14) and re-record a shorter VP9 how-to.
2. Fix the output-path field (finding 13).
3. Run a real transcription provider when one is available, and compare the
   scripted-transcript demo against it.
4. Record the picker flow with a folder that has no media, to check the empty
   state's guidance.
