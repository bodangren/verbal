# Plan: Dogfood How-To Videos

**Status:** IN PROGRESS — first cut done
**Created:** 2026-11-21
**Focus:** Make a real how-to with Verbal, then fix what gets in the way.

**Check command:** `npm run check` and `npm run e2e`.

---

## Phase 1: Reproducible recorder

- [x] Fixture project with media and a scripted transcript, prepared through the API.
- [x] One-command browser recording with step timings.
- [x] Captions burned into an MP4 with FFmpeg.

---

## Phase 2: First how-to

- [x] Record the tour: open, play, scrub, seek by word, delete a filler, deliver.
- [x] Compose and review the MP4 frame by frame.
- [x] Record the honest limitation: scripted transcript, no ASR on this machine.

---

## Phase 3: UX findings

- [x] Write the issue log (findings.md)
- [x] Fix finding 4: media files in `/api/fs/list`, `MediaPicker`, Browse… in Source media.
- [x] Record how-to #2 (import through the picker) and compose it.
- [x] Fix finding 5: storyboard from the transcript + Deliver empty-state action.
- [x] Record how-to #3 (Deliver's first storyboard) and compose it.
- [x] Fix export: talk scenes as source ranges, 48 kHz everywhere, silent brand.
- [x] Export and watch the four-scene storyboard (36.0s, 48 kHz, silent bookends).
- [x] Wire the Export preset into codecs and the container extension.
- [x] Record how-to #4 (WebM/VP9 export) and verify the produced .webm.
- [x] Prefill the export path from the project and preset (finding 13).
- [x] Report per-step export progress and show the step message (finding 14).
- [x] Record how-to #5 (fast export) showing the prefill and step messages.
- [x] Trim the 77s VP9 how-to to 13s, keeping the preset and completion.
- [x] Show the output filename under the truncated path.
- [x] Dogfood the picker's empty and missing-folder states; add a next-step hint. (symptom, why it matters, severity).
- [x] Fix the first-run blockers (waveform 500 on silent media).
- [x] Re-record with the fixes.

---

## Phase 4: Verify

- [x] `npm run check` green.
- [x] `npm run e2e` PASS (re-run after the waveform change).
- [x] Commit the harness and the fixes.

---

## Phase 5: Hillclimb to fit for purpose (Daniel, 2026-11-24)

Daniel's verdict: the app is not fit for purpose as is. Hillclimb until it is useful.
Daniel waived the Measure subagent roles for this phase; the orchestrator runs Red, Green, and verification itself.
Rule: each change fixes a failure seen in a real run. No change is made only to touch a file.

- [x] Baseline: install the new `@verbal/takes` workspace, run `npm run check` and `npm run e2e`. 731c14b
      Result: `npm install` added `@verbal/takes`; check green (780 tests, 2 skipped); e2e PASS.
- [x] Drive one real journey (import, transcribe, edit, export) and record every failure in `findings.md`. 731c14b
      Result: 10 findings (1 Blocker, 2 High, 3 Medium, 4 Low). Orchestrator verified #1, #2, #4 against code and screenshots.
- [x] Rank the findings by how much each blocks a useful result. 731c14b
      1. H1 (finding 2): Deliver export ignores transcript deletions. `startStoryboardExport` cuts the raw anchored range. Wrong file.
      2. H2 (finding 1): `tools/remotion` has no dependencies installed, and the UI hides the cause.
      3. H3 (finding 3): transcription needs a cloud key. Local whisper exists (installed at `~/tools`) but needs manual env setup.
      4. H4 (findings 4, 5, 6, 7): stale word count and media state in the browser row, enabled Export with no scenes, status bar ignores failures.
      5. H5 (findings 8, 9, 10): portrait player, default Title/Contact, reopen in Ingest.
- [x] H1: Deliver export applies transcript deletions (test first). 7f770d7
      Done and reviewed: `computeTalkRanges` (7 unit tests) feeds `startStoryboardExport`; one source range per kept stretch.
      408 server/media/compose/storyboard tests pass. Open: reorder and inserted silence still do not reach the export.
      Open: confirm the real exported duration in the journey re-run (the new test checks segment starts only).
- [x] H2: Missing Remotion dependency gives a clear message with the fix. Install `tools/remotion`. 7f770d7
      Done and reviewed: `errorCopyFor` rule; export fails fast with 503 before any job when the renderer is missing (186 server/page/lib tests, typecheck clean); `tools/remotion` installed; renderer smoke test passes.
      Open: the job line keeps "Rendering step 1 of 6" after a failure; fix with H4.
- [x] H3: Auto-select local whisper when no cloud key and a binary and model exist. 7a553c5
      H3b done and reviewed: `resolveAsr` (local first; cloud by key or `VERBAL_ASR=cloud`; "none" names what is missing), README setup, Ingest hint.
      Verified: `npm run check` 824 tests; `npm run e2e` PASS; server on this machine reports "Local (whisper small)" with no env.
      Rework caught by the e2e: a test file under `apps/web/pages/api` crashed the production server; moved, and `pages-hygiene.test.ts` guards it.
      Open: the e2e and gate scripts should force `VERBAL_ASR=cloud` so a developer's whisper install cannot leak in.
      Open: the journey re-run with real transcription.
      Installed: whisper.cpp 3e2e46a built at `~/tools/whisper.cpp`; `ggml-small.bin`; symlinked into `~/.local/share/verbal`.
      H3a done and reviewed: real binary rejects MP4 (now extracts 16 kHz WAV), `-oj` alone is sentence-level (now `-ml 1 -sow`), `-l auto`, bracket tags dropped; fixtures from real output in `packages/ai/testdata/whisper`; 41 tests.
      H3b in progress: auto-detect binary and model (local-first), "No speech engine" state, README setup.
- [x] Journey re-run 2 (real transcription, real cuts): export 59.55 s vs 59.45 s expected; cuts applied. Findings in `findings.md`. 731c14b
- [x] T3: real transcription progress (whisper `-pp` streamed; 5% / 95% / 100% mapping; cancel kills the child; failure keeps the CLI's stderr tail). 55 `packages/ai` tests. Reviewed; one rework round. 7a553c5
- [x] T1: stale UI (browser row after import/transcribe/save, status text of old jobs, Export enabled with no scenes). Reviewed; 363 `apps/web` tests. 731c14b
- [x] T2: title card defaults to the project name; Outro and Contact start empty; "Add Title And Outro Cards" checkbox; empty outro is skipped, not rendered blank. Reviewed; one rework round. 731c14b
- [x] T6: e2e and UX gate scripts force `VERBAL_ASR=cloud`. 7a553c5
- [x] Journey run 3 (real transcription; 2 deletions, 1 move, 2 s silence): export 59.888 s vs 59.80 s expected; a 2.03 s silent stretch at 31.93 s; no Blocker or High findings. The moved word could not be confirmed by audio (garbled Thai); the unit and API tests cover order. 731c14b
      Gate on the combined tree: `npm run check` 894 tests, `npm run e2e` PASS, UX gate 2 failures (transcript tab stops 15 and 200), both already in the committed report and owned by the Transcript track.
- [x] T5: Deliver scene list shows "Plays N s" (kept words plus inserted silence), with the source span as a title. 731c14b
      `playSeconds` on `PreviewScene`, computed in the preview API from `computeTalkItems`. 4 new tests.
      Gate: `npm run check` 898 tests, `npm run e2e` PASS.
- [x] Low items fixed: progress label switches to "Transcribing audio…" at 5%; Deliver restores the fast preview when a project opens (and drops the previous project's plan); the title-cards checkbox has its own `field--check` style. 731c14b
      Gate: `npm run check` 901 tests, `npm run e2e` PASS, UX gate unchanged (2 transcript tab-stop failures, owned by `fe_transcript_20261127`).
      Not checked by eye: the checkbox alignment (CSS only; no automated check).
- [x] Open, limit: `small` garbles Thai. A larger model is a download and a speed cost; Daniel decides. a64b8e3
      Resolved by Typhoon ASR (track `typhoon_integration_20261125`): CER 13.25 % vs 23.59 % for whisper small, 15x faster. Not re-run on the dogfood media.
      Evaluated 2026-11-25: Typhoon ASR Realtime 114M is much better and 15× faster than whisper small (CER 13.3 % vs 23.6 % on FLEURS Thai). Wiring it in is a separate decision; see `thai_stt_20261125/findings.md`.
- [x] T4: Reorder and inserted silence reach the Deliver export (same wrong-file class as deletions). 7f770d7
      Also fixed in review: natural pauses between words are kept (equivalence tests against `computeTalkRanges`).
      Reorder: done (`computeTalkItems`). Silence: REJECTED. Core flaw found by review: `insertSilence` shifts later word times, so they stop matching the source file; deleting a word after a silence cuts the wrong audio.
      T4b: silence becomes separate optional document state (`silences`); word times stay source-true. Correction for `silence_split_20261121/spec.md` FR1 and Non-Goals: the claim that a timestamp gap is silence is wrong. Old saved transcripts that used the shift cannot be repaired.
      Known limit: the Edit player does not play inserted silence.
- [x] Then: full `npm run check`, `npm run e2e`, gate, a third journey run, commit. Done; see the commits. 731c14b
- [x] H4 and H5 (superseded by T1 to T6 above): fix in rank order. Re-run the journey after each. Stop when the journey gives a correct file. 731c14b
