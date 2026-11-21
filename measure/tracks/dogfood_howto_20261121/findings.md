# Dogfood Findings — First How-To (2026-11-21)

Made with `tools/dogfood/record-howto.mjs` + `compose-howto.mjs`. The demo
transcript is **scripted**: this machine has no ASR key and no whisper binary.

| # | Severity | Symptom | Cause | Status |
|---|----------|---------|-------|--------|
| 1 | High | The player loses its waveform and the browser logs a **500** for a silent take. | `showwavespic` fails when the input has no audio stream; the endpoint surfaced that as 500. | **Fixed** — the waveform falls back to a flat line and logs the original failure; unit + service tests added. |
| 2 | Medium | The first cut showed the *previous* UI inside the demo video. | The fixture reused the old walkthrough screen recording as demo media. | **Fixed** — the fixture now generates neutral footage with a real audio track. |
| 3 | Low | The how-to brand label covered the app's own title bar. | Composer drew it at `y=26`, inside the app chrome. | **Fixed** — removed the duplicate brand; the scripted-transcript note moved to the bottom-right. |
| 4 | High (open) | Importing a take requires typing an absolute file path. The browser lists folders only. | `Source media` is a text field; `/api/fs/list` has no file mode. | **Open** — next: a file picker (files + folders) so media can be imported by clicking. |
| 5 | Medium (open) | Deliver is blank for a fresh project; Fast preview can be a placeholder with no explanation. | The storyboard starts empty and nothing guides the first scene. | **Open** — offer a generated first scene or an explicit empty-state action. |
| 6 | Info | Mode buttons and transcript words can share names (`Deliver`), so automation must scope to the navigation. | Chrome and content share the same accessible names. | **Noted** — the recorder scopes to the mode nav; revisit if a real ambiguity appears. |
| 7 | Environment | Transcription cannot be dogfooded here. | No `OPENAI_API_KEY`, no `whisper` binary. | **Recorded** — transcript is scripted; the rest of ingest/edit/deliver is real. |

## What worked well

- The browser → project → Edit path is quick, and the player transport is now
  visible and scrubbable (the clipping fix from the previous turn held up).
- Project rows carry enough metadata (words, media, age) to choose without
  opening each one.
- The auto-save and status bar made the recording feel like a normal app; no
  modal or confirmation interrupted the take.

## What the next dogfood run should try

1. Import a take through the UI instead of the API (finding 4).
2. Make a how-to about *making* a storyboard scene, which exercises Deliver.
3. Record a second how-to after the finder fix and compare the flow.
