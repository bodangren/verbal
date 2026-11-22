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

## What worked well

- The browser → project → Edit path is quick, and the player transport is now
  visible and scrubbable (the clipping fix from the previous turn held up).
- Project rows carry enough metadata (words, media, age) to choose without
  opening each one.
- The auto-save and status bar made the recording feel like a normal app; no
  modal or confirmation interrupted the take.

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

1. Export the created storyboard to a real MP4 and watch it end to end.
2. Run a real transcription provider when one is available, and compare the
   scripted-transcript demo against it.
3. Record the picker flow with a folder that has no media, to check the empty
   state's guidance.
