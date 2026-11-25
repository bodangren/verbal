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

## Phase 5 Journey Audit (2026-11-24)

One real journey ran on port 3299 against the built server in headless Chromium.
Project: `/tmp/journey-media/projects/Dogfood Run`. Clip: the 58.625 s sample.
Transcript: 40 scripted words at 1.45 s each, from 0.00 s to 58.00 s.
Final edit state: four words removed (`w3`, `w12`, `w23`, `w34`).
No transcription key was configured.
Screenshots: `/tmp/journey-media/shots/`. Run log: `/tmp/journey-media/journey.log`.

| # | Step | What happened | Expected | Evidence (screenshot or command output) | Severity |
|---|------|---------------|----------|------------------------------------------|----------|
| 1 | Export to MP4 | The export job failed at step 1 of 6. The inspector read "Job failed · 0% · Rendering step 1 of 6 · Something went wrong. Try again, or check the server log." The job record held the real cause: `Cannot find package '@remotion/bundler' imported from /home/daniebo/Desktop/verbal/tools/remotion/render.mjs`. No MP4 was written. | A playable MP4 at `/tmp/journey-media/projects/Dogfood Run/exports/Dogfood Run.mp4`. | `/tmp/journey-media/shots/14-export-done.png`; `/tmp/journey-media/.local/share/verbal/jobs.json`; `ffprobe -v error -show_entries format=duration .../exports/Dogfood Run.mp4` → "No such file or directory" | Blocker |
| 2 | Check exported duration | No file exists, so no duration could be read. The storyboard kept four ranges: 0.00–14.50, 14.50–29.00, 29.00–43.50, 43.50–58.00. They total 58.00 s. The four cuts were not reflected in any range. | Kept programme 52.20 s (58.00 − 4 × 1.45). With the default 3 s title and 3 s outro, final MP4 58.20 s. A working export would have given 64.00 s, so the cuts would still be lost. | `/tmp/journey-media/shots/12-storyboard-created.png`; `/tmp/journey-media/storyboard.json`; `/tmp/journey-media/journey.log` STEP4 removed list; `ffprobe` source → `duration=58.625000` | High |
| 3 | Attempt transcription | The alert read "Something went wrong. Try again, or check the server log." followed by "OPENAI_API_KEY is not set" and a Dismiss button. "Try again" repeated the same failure. No text named where to add a key or how to choose local mode. NEXT STEPS kept "Transcribe Pending". | One clear next step, such as a settings link or a local-mode choice. | `/tmp/journey-media/shots/05-transcribe-failure.png`; `/tmp/journey-media/transcribe-attempt.txt` | High |
| 4 | Edit and check word counts | The header badge counted kept words: 35, then 36. The project row still read "40 words · 58s · Media · Today" in Edit and Deliver. | The browser row matches the saved transcript. | `/tmp/journey-media/shots/07-five-deleted.png`; `/tmp/journey-media/shots/09-undo-redo.png`; `/tmp/journey-media/shots/12-storyboard-created.png` | Medium |
| 5 | Import the clip | The right panel read "Reading media..." while the status bar already read "Media imported". The project row still read "No transcript · No media · Today". | Panel, row, and status bar settle on the imported state together. | `/tmp/journey-media/shots/03-media-imported.png`; `/tmp/journey-media/shots/05-transcribe-failure.png` | Medium |
| 6 | Open Deliver before a storyboard | "No Scenes Yet" was shown, but "Export Storyboard" stayed enabled and brightly styled. A first-time user could click it and reach a dead end. | Disable the button or name the missing step on it. | `/tmp/journey-media/shots/11-deliver-before-storyboard.png` | Medium |
| 7 | Export failure feedback | The inspector showed the failed job. The status bar still showed "Created 4 scenes from the transcript". | Status bar shows the failure too. | `/tmp/journey-media/shots/14-export-done.png`; `/tmp/journey-media/journey.log` STEP5 deliver tail | Low |
| 8 | Play the edit | The 1080×1920 clip appeared as a narrow strip inside a wide black player. The active word highlight followed playback. | A preview sized for portrait media, or a clear portrait mode. | `/tmp/journey-media/shots/10-playback.png`; `/tmp/journey-media/shots/06-edit-seeded.png` | Low |
| 9 | Create the storyboard | Title was "Untitled" and Contact was "Daniel". The journey never set those values. The user could export that title without noticing. | Brand fields start from the project or prompt for a title. | `/tmp/journey-media/shots/11-deliver-before-storyboard.png`; `/tmp/journey-media/shots/12-storyboard-created.png` | Low |
| 10 | Reload after seeding the transcript | The app reopened in Ingest. The user had to click Edit again to reach the transcript. | Resume the last workspace, or open Edit when a transcript exists. | `/tmp/journey-media/journey.log` STEP3; `/tmp/journey-media/shots/06-edit-seeded.png` | Low |

## Phase 5 Journey Audit, Run 2 (2026-11-24)

Real transcription, real cuts, real export. Port 3299, real HOME, no API key and no fake ASR setting. `/api/system` reported `"mode":"local"` and `"label":"Local (whisper small)"`.
Project: `/tmp/journey-media/run2/projects/Dogfood Run 2`. Clip: `/tmp/journey-media/run2/sample.mp4` (58.625 s).
Transcription took 58.2 s and returned 32 words. Last word ended at 58.00 s.
Screenshots: `/tmp/journey-media/run2/shots/`. Log: `/tmp/journey-media/run2/run2.log`.

### Status of Run 1 findings

| # | Status | Evidence |
|---|--------|----------|
| 1 | Fixed | The export job reached "Job done · 100% · Export complete" and wrote `Dogfood Run 2.mp4`. `ffprobe` returned `duration=59.554667`. `/tmp/journey-media/run2/shots/14-export-finished.png`. The module-not-found error did not recur. |
| 2 | Changed | Cuts now shorten the export. Expected final 60.075 s, actual 59.554667 s, difference −0.520333 s. The storyboard still shows one scene 0.00–58.00 s. `/tmp/journey-media/run2/shots/12-storyboard-created.png`; `/tmp/journey-media/run2/arithmetic.txt`; `/tmp/journey-media/run2/export-probe.txt`. |
| 3 | Fixed | Ingest said "Provider: Local (whisper small) · Audio stays on this machine." Transcription succeeded with real audio and no scripted transcript. `/tmp/journey-media/run2/system.json`; `/tmp/journey-media/run2/shots/01-home.png`; `/tmp/journey-media/run2/shots/07-transcribe-finished.png`. |
| 4 | Still present | The project row still read "No transcript · No media · Today" after transcription, edits, and export. `/tmp/journey-media/run2/shots/04-media-imported.png`; `/tmp/journey-media/run2/shots/14-export-finished.png`. |
| 5 | Still present | The right panel read "Reading media..." while the status bar read "Media imported". `/tmp/journey-media/run2/shots/04-media-imported.png`. |
| 6 | Still present | "No Scenes Yet" was shown while "Export Storyboard" stayed enabled. `/tmp/journey-media/run2/shots/11-deliver-before-storyboard.png`. |
| 7 | Changed | No export failure occurred. Inspector and status bar agreed at the end. `/tmp/journey-media/run2/shots/14-export-finished.png`. Stale text still appears earlier; see new finding 6. |
| 8 | Still present | The 1080×1920 clip appeared as a narrow strip inside a wide black player. `/tmp/journey-media/run2/shots/09-four-deleted.png`; `/tmp/journey-media/run2/shots/10-saved.png`. |
| 9 | Still present | Title stayed "Untitled" and Contact stayed "Daniel". `/tmp/journey-media/run2/shots/11-deliver-before-storyboard.png`; `/tmp/journey-media/run2/shots/14-export-finished.png`. |
| 10 | Not exercised | Run 2 did not reload the page. No screenshot exists. The three labels above do not fit an untested item. |

### New findings

| # | Step | What happened | Expected | Evidence | Severity |
|---|------|---------------|----------|----------|----------|
| 1 | Check exported duration | Four words were removed from `transcript.json`: `w6` 13.16–14.84, `w12` 24.49–24.97, `w19` 34.55–36.08, `w25` 52.54–53.00. Widened by 0.05 s each side: 1.78 + 0.58 + 1.63 + 0.56 = 4.550 s union. Expected kept 58.625 − 4.550 = 54.075 s. Expected final 54.075 + 3 + 3 = 60.075 s. `ffprobe` returned 59.554667 s. Difference = −0.520333 s. | 60.075 s. The scene ends at the last word (58.00 s), so the final 0.625 s of source is not exported. | `/tmp/journey-media/run2/arithmetic.txt`; `/tmp/journey-media/run2/export-probe.txt`; `/tmp/journey-media/run2/shots/12-storyboard-created.png` | Medium |
| 2 | Verify the deleted words | Whisper on the full exported WAV reported "ผลตรวด" at 26.39–26.93 s, the text of deleted `w12`. Whisper on the trimmed programme WAV reported "พนตรวจ" at 23.93–24.89 s instead. The other three exact strings were absent at their old spots. "ทักษาการคิดเชิญตรักกะ" appeared at 5.64–7.00 s, which is kept `w2`. A near-match "ไม่ว่าลูกคุณจะฟันเป็นอะไร" appeared at 40.00–43.04 s, far from the `w25` spot near 48.5 s. I cannot hear audio, so the `w12` hit is unverified. | All four deleted words absent at their old spots in both runs. | `/tmp/journey-media/run2/exported-audio.json`; `/tmp/journey-media/run2/programme.json`; `/tmp/journey-media/run2/projects/Dogfood Run 2/transcript.json`; `/tmp/journey-media/run2/whisper-export.log` | High |
| 3 | Transcribe | The UI showed "Transcribing… 10%" at 5 s and still "Transcribing… 10%" at 20 s. It stayed at 10% until the job ended at 58.2 s. The page did not freeze; the button stayed disabled. | Progress that advances, or a message that says the engine is working with no percentage. | `/tmp/journey-media/run2/shots/06-transcribing-5s.png`; `/tmp/journey-media/run2/shots/06-transcribing-20s.png`; `/tmp/journey-media/run2/transcribe-progress.json` | Medium |
| 4 | Read the real transcript | The file held 32 words and ended at 58.00 s, so timings were sane. Text was often garbled, for example "คอมพุทธธิ์ชน์ค์ค์ค์ค์ค์ค์ค์การแยกปัญหา". Two long spans, "CodeCamp" 38.00–44.62 and "Advantage" 44.62–52.00, covered the music outro. `w26` had equal start and end, 53.00–53.00. No warning asked the user to review the text before cutting. | Low-confidence or zero-length words flagged before editing. | `/tmp/journey-media/run2/projects/Dogfood Run 2/transcript.json`; `/tmp/journey-media/run2/shots/08-edit-transcript.png` | Medium |
| 5 | Look at Edit | The Cleanup panel showed a long list of Thai words that ran past the bottom of the viewport. No scroll control was visible. | A bounded, scrollable panel. | `/tmp/journey-media/run2/shots/08-edit-transcript.png`; `/tmp/journey-media/run2/shots/09-four-deleted.png`; `/tmp/journey-media/run2/shots/10-saved.png` | Low |
| 6 | Open Deliver and export | The status line still read "Job done · 100% · saving transcript" in Deliver, after storyboard creation, and at the moment Export was clicked. No "Job running" text appeared in that first export screenshot. | Status follows the current workspace and job. | `/tmp/journey-media/run2/shots/11-deliver-before-storyboard.png`; `/tmp/journey-media/run2/shots/12-storyboard-created.png`; `/tmp/journey-media/run2/shots/13-export-running.png` | Medium |
| 7 | Create the storyboard | The preview showed one speaker scene, 0.00–58.00 s. It gave no sign of the four cuts, although the exported file was shorter than 58 s. | Preview shows the kept programme length. | `/tmp/journey-media/run2/shots/12-storyboard-created.png`; `/tmp/journey-media/run2/export-probe.txt` | Medium |
| 8 | Import Media | The picker opened with "Reading folder..." and an empty body. It showed no path while loading. | Show the folder path during loading. | `/tmp/journey-media/run2/shots/03-import-picker.png` | Low |

## Phase 5 Journey Audit, Run 3 (2026-11-24)

Third real journey. Port 3299, real HOME, no key and no fake ASR setting. `/api/system` reported `"mode":"local"`.
Project: `/tmp/journey-media/run3/projects/Dogfood Run 3`. Real transcription returned 32 words in 54.3 s.
Screenshots: `/tmp/journey-media/run3/shots/`. Log: `/tmp/journey-media/run3/run3.log`.

### Fix verification

| Bullet | Status | Evidence |
|--------|--------|----------|
| Project row refreshes after import, transcription, save | Fixed | After import the row read "No transcript · Media · Today". After transcription it read "32 words · 58s · Media · Today". After edits it read "30 words · 58s · Media · Today". `/tmp/journey-media/run3/shots/04-media-imported-immediate.png`; `/tmp/journey-media/run3/shots/07-transcribed.png`; `/tmp/journey-media/run3/shots/12-undo-redo.png`. |
| "Reading media…" clears | Fixed | The panel showed "Reading media..." immediately after import, then full media details 1.5 s later. `/tmp/journey-media/run3/shots/04-media-imported-immediate.png`; `/tmp/journey-media/run3/shots/05-media-settled.png`. |
| Finished job text clears on mode change or new action; export shows "Job running · N% · …" | Fixed | Deliver and storyboard screens show no old job text. Export statuses were "Job running · 0% · Rendering step 1 of 9", 20%, 40%, 70%, 80%, then "Job done · 100% · Export complete". `/tmp/journey-media/run3/shots/13-deliver-no-scenes.png`; `/tmp/journey-media/run3/shots/14-storyboard.png`; `/tmp/journey-media/run3/export-status.json`; `/tmp/journey-media/run3/shots/16-export-finished.png`. The screenshot taken at the exact click still shows the prior line; the status samples prove the running text appeared. |
| "Export Storyboard" disabled with "Create a storyboard first." | Fixed | The button was disabled and the reason was visible with "No Scenes Yet". `/tmp/journey-media/run3/shots/13-deliver-no-scenes.png`. |
| Transcription progress advances | Fixed, coarse | At 5 s the status was "Job running · 5% · Extracting audio…". At 20 s it was still 5% with the same text. At 40 s it was "Job running · 37% · Transcribing audio…". `/tmp/journey-media/run3/shots/06-transcribing-5s.png`; `/tmp/journey-media/run3/shots/06-transcribing-20s.png`; `/tmp/journey-media/run3/shots/06-transcribing-40s.png`; `/tmp/journey-media/run3/progress-samples.json`. See new finding 1. |
| Title defaults to project name; Outro and Contact empty; cards checkbox present | Fixed | Checkbox checked, Title "Dogfood Run 3", Outro "", Contact "". The frame at t=1 s is black with white text "Dogfood Run 3". The frame at duration−1 s is the source outro, blue with the Reading Advantage logo and Thai text; no generated outro card. `/tmp/journey-media/run3/shots/13-deliver-no-scenes.png`; `/tmp/journey-media/run3/shots/14-storyboard.png`; `/tmp/journey-media/run3/frame-first.png`; `/tmp/journey-media/run3/frame-last.png`. |

Reload opened mode Deliver with project "Dogfood Run 3" (`aria-current="Deliver"`). Old finding 10 is fixed. `/tmp/journey-media/run3/shots/17-after-reload.png`.

### Saved transcript state after edits

Removed: `w8` "แยกประเด็น" 16.92–18.00 and `w20` "ยิ่งกลายเป็นสัญชาติยาง." 36.08–38.00.
Order after the Move Forward edit: `w0 w1 w2 w3 w4 w6 w5 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16 w17 w18 w19 w20 w21 w22 w23 w24 w25 w26 w27 w28 w29 w30 w31`. The moved word was `w5` "จดจำรูปแบบ", from index 5 to index 6, now after `w6`.
Silences after redo: `[{"afterWordId":"w15","seconds":2}]`. Undo removed the entry; redo restored it.
Full word list: `/tmp/journey-media/run3/transcript-final.json`.

### Duration arithmetic

Scene last word end 58.00 s. Widened cuts: `w8` [16.87,18.05] = 1.18 s; `w20` [36.03,38.05] = 2.02 s. Union = 3.20 s.
Expected = 58.00 − 3.20 + 2.00 (silence) + 3.00 (title card, no outro) = **59.80 s**.
Actual `ffprobe` container duration = **59.887696 s**. Difference = **+0.087696 s**, inside the 0.5 s tolerance. `/tmp/journey-media/run3/export-probe.txt`.

### Order and silence proof

Expected silence start: `w15` ends at 30.08 s; prior widened cut 1.18 s; programme start 3.00 s; so about 31.90 s.
`silencedetect` reported silence 31.926–33.96 s, duration 2.034 s. That matches. It also reported the title silence 0–3.021 s. `/tmp/journey-media/run3/silencedetect.txt`.
Whisper on the exported WAV returned 25 segments. The opening order matched the saved order: `คอดดิง`, `ไม่ใช่แค่สำรับนักพัฒนา`, `ทักษาการคิดเชิญตรักกะ`, `ช่วยอาชีพอื่นได้มากว่าที่คิด`. The later order broadly matched too: `ตัดสิ้นใจบนข้อมูล`, `วิครอสตลาด`, `และลดความเสียง`, `ยิ่งเริ่มฝึกตั้งแต่เด็ก`, `เน็นเข้าใจเนาวคิดเชิญตรักกะ`, `ไม่ใช่แค่จดจำว่ายาก่อน`, `ไม่ว่าลูกคุณจะฟันเป็นอะไร`, `วันนี้`. The moved word `จดจำรูปแบบ` could not be identified at its new spot. The Thai output was garbled and repeated `ไม่ใช่แค่สำรับการคิดเชิญตรักกะ` five times between 14.59 s and 34.06 s. I could not confirm the swap from the audio. `/tmp/journey-media/run3/exported-audio.json`.

### New findings

| # | Step | What happened | Expected | Evidence | Severity |
|---|------|---------------|----------|----------|----------|
| 1 | Transcribe | The status stayed "Job running · 5% · Extracting audio…" from 5 s to 20 s, then jumped to 37% at 40 s with "Transcribing audio…". The phase name was wrong during the long middle. | Progress text matches the phase the engine is in. | `/tmp/journey-media/run3/shots/06-transcribing-5s.png`; `/tmp/journey-media/run3/shots/06-transcribing-20s.png`; `/tmp/journey-media/run3/shots/06-transcribing-40s.png` | Low |
| 2 | Order proof | The moved word `จดจำรูปแบบ` could not be found at its new position in the whisper output. The output was garbled and repeated one phrase five times. Only the broad order before and after that region was confirmed. | The moved word is identifiable at the position saved in the transcript. | `/tmp/journey-media/run3/exported-audio.json`; `/tmp/journey-media/run3/transcript-final.json` | Medium |
| 3 | Reload | Deliver reopened with the saved project, but the preview area said "No Preview Yet" and offered "Render Preview" again. The storyboard existed and had already exported. | Preview state survives a reload, or the page explains why it was dropped. | `/tmp/journey-media/run3/shots/17-after-reload.png` | Low |

### Orchestrator review of Run 2 (2026-11-24)

- Run 2 new finding 1 (Medium) is withdrawn. The subagent computed the expected length from the 58.625 s source. The scene ends at the last word, 58.00 s. Correct expectation: 58.00 − 4.55 + 6 = 59.45 s. Measured 59.55 s, a 0.10 s difference over four joins. The cuts are applied.
- Run 2 new finding 2 (High) is withdrawn as inconclusive. Whisper is not stable on the garbled Thai, and the subagent could not hear the audio. The duration arithmetic and the `computeTalkRanges` unit tests are the evidence.
- Confirmed real and open, ranked by effect on a useful result:
  1. Browser row stays "No transcript · No media" after import and transcribe (old 4, old 5). The app looks broken.
  2. Transcription shows 10% for 58 s with no change (new 3). A long video gives no sign of life.
  3. Status line shows an old job (new 6). The Export button is live with no scenes (old 6).
  4. Export cards default to "Untitled" and "Daniel" (old 9). A real export ships a wrong title card.
  5. Reorder and inserted silence in Edit still do not reach the Deliver export.
  6. The preview shows 58 s, not the cut length (new 7).
  7. No review prompt for garbled or zero-length words (new 4). Model quality is a limit of `small` on Thai.
