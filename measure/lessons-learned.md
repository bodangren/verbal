# Lessons Learned

> The Go/GTK4 section is historical — it describes the retired implementation. The TypeScript section is current.

## TypeScript / vinext / FFmpeg (current)

- **vinext registers `@vitejs/plugin-react` itself.** Adding it manually fails the build with "Duplicate @vitejs/plugin-react detected". Use `plugins: [vinext()]` only.
- **Pages Router, not App Router.** vinext's App Router development environment can fail on native Node modules; the Pages Router avoids it and loses nothing for a client-heavy editor.
- **`next-env.d.ts` is generated and references `.next/types`.** Commit it and a fresh clone fails typecheck before the first build. Ignore it.
- **Testing Library auto-cleanup needs Vitest globals.** With `globals: false`, `cleanup` is not registered; call it in `afterEach` or DOM leaks between tests.
- **Inject schedulers instead of faking timers.** Passing a `PlaybackScheduler` into a polling hook makes frame loops testable without `vi.useFakeTimers`, and keeps the production path unchanged.
- **Serialise job progress before completion.** Progress writes fired without awaiting can land after `complete`, leaving a done job at 40%. Chain them through a promise and await it before completing.
- **Reconcile interrupted jobs on startup.** A `running` job whose process died must be marked `failed`, not silently re-run; re-running an export surprises the user more than reporting it.
- **Keep paths out of filtergraphs.** FFmpeg filter syntax has its own quoting rules. Paths belong in argv slots; only timestamps and labels belong in the filter string.
- **Round timestamps to microseconds.** Floating-point noise otherwise makes serialised cut lists and storyboards differ across runs and defeats caching/diffing.
- **npm workspaces need `workspaces` in `package.json` and `"*"` ranges** — npm does not accept pnpm's `workspace:*` protocol.
- **A missing-module failure is a valid Red phase in TypeScript**, but pair it with a compile-time interface assertion (`const _x: SomeInterface = fake`) so a later refactor cannot quietly break the contract.
- **vinext parses JSON bodies before the handler runs.** Reading `req` as a stream then yields nothing, so every handler saw an empty body and returned 400. Prefer `(req as { body?: unknown }).body` and fall back to the stream only when it is absent.
- **Read browser-only capabilities with `useSyncExternalStore`.** A synchronous `setState` inside `useEffect` trips the React Compiler lint rule and creates a hydration mismatch; `useSyncExternalStore(subscribe, clientSnapshot, () => false)` is both lint-clean and hydration-safe.
- **Record un-keyed.** Capture writes the raw source; keying happens at composite time so a take can be re-keyed with different settings without re-recording.
- **A failed capture must leave no partial file.** Unlink on every error path, including cancellation, or a broken take will look like a finished one.
- **Price before you generate.** `estimateCost` must be local (no network), and the UI keeps generation disabled until an estimate exists. An estimate that costs money to obtain is not an estimate.
- **Address assets by content hash.** Identical bytes are a no-op, so a scene can never silently point at different content, and deduplication is free.
- **Asset-backed scenes skip the renderer.** A generated image composites directly with `-loop 1`; it should never enter the Remotion cache, which is keyed to templates and props.
- **Allow pending generated scenes.** A `generated-image` scene is valid before it has an asset; only `static` requires one. Otherwise generation could never create the first asset for its own scene.
- **Long generation belongs in the job registry.** An HTTP request cannot outlive a two-minute model call; generation runs as a job, reports progress, and aborts through `DELETE /api/jobs/[id]`.
- **Placeholders must be explicit.** A pending generated scene plans as `placeholder`, never `asset`, so the preview panel tells the truth before anything exists.
- **Video assets are trimmed, images loop.** The step adapter needs `assetKind`; looping a clip or trimming a still are both wrong.
- **Duplicate landmark names are a real bug.** Two regions both labelled `Transcript` (and two `Capture`) broke strict role+name locators *and* screen-reader navigation. Name each landmark for its role, not its topic.
- **A browser walkthrough catches what unit tests cannot.** The first run found a duplicate-landmark collision, unnamed textareas, and a fixture mismatch — none of which any component test would have surfaced.
- **Give testable controls accessible names.** `aria-label` on the storyboard and patch textareas made role+name locators possible; CSS-class locators would have been brittle.

## Remotion / storyboard pipeline

- **Drive the system Chrome.** Point `browserExecutable` at `/usr/bin/google-chrome` (overridable with `VERBAL_CHROME`). A per-project Chromium download is ~150 MB and pointless when the system already has a browser.
- **Cache the webpack bundle by source hash.** Bundling dominates short renders; stamping `.bundle/source-hash.txt` turns repeat renders from seconds of bundling into near-zero.
- **Hash scene content, not scene identity.** `slideRequestHash` excludes the scene id, so renaming or reordering a scene keeps its cached frames, and two brand steps with identical text share one render.
- **Composite per step, then concat with `-c copy`.** Every step must share codec settings or the concat demuxer produces a broken file. Passing codec options through `CompositeRequest` makes that explicit.
- **Keep the adapter thin and injected.** `assembleStoryboard` takes `renderStep` and `concat`; `createStepRenderer` is the only place that knows Remotion and FFmpeg, and both are testable with fakes.
- **A failed step must fail the assembly.** Never concatenate a partial list: a shorter video that looks finished is worse than an error.
- **Full-frame vs keyed steps.** Brand bookends render `full-frame`; storyboard scenes default to `speaker-inset`, which is what makes the green-screen workflow visible in the output.

## Go + GTK4 + GStreamer (retired 2026-11-20)

- **Thread Safety:** Always route GTK UI updates through `glib.IdleAdd`. Direct widget access from goroutines causes crashes.
- **Headless Tests:** Skip tests requiring a display or hardware with `t.Skip`. Mock GStreamer pipelines and cloud providers in unit tests.
- **GTK Initialization Detection:** `DISPLAY`/`WAYLAND_DISPLAY` env vars alone do not guarantee a usable GTK display. Tests that create GTK widgets must attempt `gtk.Init()` and skip on panic to remain CI-stable.
- **GStreamer Path Safety:** Sanitize every file path before interpolating it into a pipeline description. Prefer element properties over string interpolation where possible.
- **Binary Search for Timestamps:** Use O(log n) lookup for word-by-time queries, not linear scans.
- **Context Cancellation:** Pass `context.Context` through async operations (transcription, export, recording) so they stop cleanly on app shutdown.
- **Provider Abstraction:** Keep OpenAI/Google/local transcription details behind a single interface in `internal/ai`. No SDK imports in UI or app controller.
- **Database Migrations:** Use a versioned `schema_migrations` table from day one. Avoid ad-hoc column-backfill helpers.
- **SQLite Concurrency:** Set `PRAGMA busy_timeout` and `PRAGMA journal_mode = WAL` on every SQLite connection to avoid `SQLITE_BUSY` when background goroutines and tests access the database concurrently.

## Batch Transcription Queue

- **Reconcile on Entry:** When a batch queue runner starts, reconcile any stale `processing` rows back to `pending` before dequeuing. This handles crashes or restarts that leave items stranded mid-flight.
- **Queue Atomicity:** Use database-level atomic dequeue (UPDATE ... WHERE status = 'pending' LIMIT 1) to prevent duplicate processing when multiple goroutines or processes poll the queue.
- **FSM per Item:** Model each queue item's lifecycle as a finite state machine (pending → processing → completed|error|cancelled). Reject illegal state transitions explicitly.
- **Progress Callbacks via IdleAdd:** Route all GTK progress-bar updates from batch processing goroutines through `glib.IdleAdd` to avoid cross-thread widget access crashes.
- **Cancel Propagation:** Pass `context.Context` through the transcription runner so that canceling a batch job propagates cleanly to the in-flight API call without leaving the database in an inconsistent state.

## Export Presets and Profiles

- **Append-Only Migrations:** When adding a new SQLite table, append a fresh migration version (never edit existing versions). `migrations_compat_test.go` proves the chain stays unbroken — it continues to pass after the new version is added. Reusing a version number silently breaks databases that already ran past it.
- **Built-in vs Custom via `is_builtin` Flag:** Distinguish shipped presets from user edits with a boolean column rather than a magic name or hard-coded ID list. `SeedBuiltins` uses `INSERT OR IGNORE` so user-customised rows sharing a built-in name are preserved across restarts. UI greys the edit/delete buttons when `is_builtin=1`; the repository also rejects mutations on built-ins as defence in depth.
- **Stream-Copy Needs Both Checks:** Stream-copying requires BOTH `CodecInfo.CanStreamCopy()` (hardware path support) AND preset-codec matching the source codec. Either check alone is wrong: an H.264 preset + VP9 source must re-encode even though VP9 supports stream-copy into webm. Gate the decision on `CanStreamCopy() && presetCodec == sourceCodec`.
- **Audio-Only via Empty VideoCodec:** Model audio-only presets (Podcast Audio, AAC-only m4a) by leaving `VideoCodec=""`. The pure-function translator `PresetToPipelineConfig` flips `AudioOnly=true` and skips the video encoder entirely when the field is empty.
- **Pure-Function Translator Pattern:** Keep `PresetToPipelineConfig` as a pure function in `internal/media`, separate from the GTK widget. The widget calls the function with a `CodecInfo` from the production `CodecDetector`; unit tests call it directly with a hand-built `CodecInfo` so stream-copy decisions are testable without GStreamer or a display.
- **Compile-Time Interface Assertions:** `var _ PresetListModel = (*stubPresetListModel)(nil)` and `var _ PresetCodecDetector = (CodecDetector)(nil)` are the cheapest insurance against drift. The stub cannot satisfy the interface unless the production adapter also does. Run them inside a `_test.go` file with `func Test*_InterfaceContract(t *testing.T)` so headless CI catches interface drift even when GTK is unavailable.
- **Headless-CI Red Signal:** Mix display-gated tests with a single display-independent compile-time contract test per UI file. The compile-time test fails the build cleanly under `go test` in headless CI (the `hasDisplay()` skip cannot help when the package won't compile), preserving the Red signal that the package-build failure would otherwise mask.
- **Model Interface Pattern for UI Panels:** Decouple GTK widgets from the database with a small interface (`PresetListModel`, `PresetManagementModel`) that the production `*PresetRepository` satisfies in `internal/app/run.go`. Tests use a stub that records calls; production wiring uses the real repo. Mirrors the `BatchQueueModel` pattern — keep it consistent across new UI panels.

## MVP Library & Export

- **STUB-Block Test File for New Contracts:** When introducing a new contract that doesn't exist in HEAD (e.g., `RecordingStatus` enum, `media.Exporter`, `settings.Paths`), the Red-phase test file can carry both the failing tests AND a clearly-marked STUB block of the expected API. The test file compiles, the rest of the package keeps passing under `make go-check`, and the Green role completes the contract in one atomic commit (delete the STUB block, drop every `t.Skip` guard, add the real implementation in the production file). Preserves the "no production source in Red phase" boundary that the workflow enforces; the STUBs exist only in the `_test.go` file so `go build ./...` is unaffected. See `test-strategy §8`.
- **Mandatory Smoke Test for Cross-Package Fakes:** When a controller test suite uses a fake `Exporter`/`Deleter` interface, the fake and the production type may have subtly different shapes (e.g., `media.progressFunc` is a named type vs. the test's `func(float64, string)` literal — direct interface satisfaction is impossible, requiring an adapter). To prevent the fake from silently shadowing the real path, every fake-harness test file MUST also include a `TestSmoke_` test that constructs the real production type and exercises the controller API. The smoke test is not excluded from `go test ./...` and proves the real wiring works at HEAD. Naming convention `TestSmoke_*` makes the test discoverable in audit and impossible to skip by accident.
- **Path Safety on User-Controlled Destinations:** Even non-shell operations like `os.Create(destPath)` require `filepath.Clean` on user input from a GTK file chooser. The original-file export flow (`Controller.ExportRecording` → `media.Exporter.Export`) must call `filepath.Clean` on `destPath` in the controller glue (`internal/app/run.go`) BEFORE reaching the exporter, so downstream `os.MkdirAll` and `os.Create` never see `..` traversal or empty strings. Cheap guardrail; only takes one line.
- **First-Run Idempotency for Project Bootstrap:** Project-directory bootstrap (`Paths.Initialize`) must be safe to call repeatedly and MUST NOT clobber an existing `verbal.db`. Use `os.MkdirAll` (not `os.Mkdir`) for the parent + subdirs, leave the `DatabasePath` file untouched, and verify with a no-clobber test (write sentinel bytes, re-init, assert sentinel preserved). The same pattern applies to any "first-run" component that creates files a user might have hand-edited.
- **Default-Path Drift Across Spec Changes:** When a spec changes a default path (e.g., `~/.config/verbal/recordings.db` → `projectDir/verbal.db`), every legacy default string in the codebase must be threaded through the new contract — not left as "just a default" in `DefaultDBPath()` or controller initializers. An integration test that asserts the new path + new file name in the default first-run flow catches this drift cleanly. The adversarial audit on Phase 5 found exactly this; the fix was to derive both `DefaultDBPath()` and the default `Initialize()` from `settings.DefaultProjectDir()` / `settings.NewPaths()`.

## General

- **MVP First:** Build the smallest end-to-end flow (record/import → transcribe → playback → delete word → export) before adding advanced features.
- **Tests Before UI:** Verify media pipeline correctness with real fixtures before wiring it to GTK widgets.
- **Keep main.go Small:** The application controller belongs in `internal/app`, not the entry point.

## UI Rebuild (2026-11-21)

- **"New project here" means a new subfolder.** `createProject(fs, root, { name })` writes `project.json` at `root`. Passing the browsed folder as `root` turns that folder into the project; derive `root = <browsed>/<safe name>` in the page instead.
- **Modes that unmount must keep their landmarks.** Conditional mode rendering removes the old stacked panels. Put `role="region" aria-label="…"` on the visible card (Playback, Transcript editor, Cleanup, Export) so screen readers and the walkthrough see the same regions the stacked layout had.
- **Two live regions are fine; ambiguous locators are not.** The save state and the status-bar message both use `aria-live`. Pin tests to `.bar__save`, not `getByRole("status")`, which now matches two elements.
- **Collapsed detail sections need the walkthrough to open them.** Moving developer controls under `<details>` is good for the UI and means the e2e must click the summary before filling those fields.
- **A folder created after page load is not in the list.** The browser lists on mount and on navigation; click Home (or navigate) to refresh before clicking a project the API just created.

## Playback and Flex Layout (2026-11-21)

- **A flex scroll stage clips its children unless they opt out of shrinking.** `.stage__scroll` is a `display:flex; flex-direction:column; overflow-y:auto` container; its children default to `flex-shrink: 1`. The player card was compressed from 597px of content to 512px, and `overflow: hidden` clipped the Play button entirely — the control existed in the DOM and passed Playwright visibility, but no human could see it. `> * { flex-shrink: 0 }` on the scroll container is the fix.
- **Verify layout with numbers, not just screenshots.** `getBoundingClientRect()` plus `clientHeight` vs `scrollHeight` on the card showed the clipping in one probe; the screenshot alone looked plausible because the clipped control simply vanished.
- **Playback must not depend on transcription.** A take is reviewable before it has words. `PlaybackScreen` now accepts `transcript: null`, and Edit renders the player whenever media exists; the transcript card becomes the empty state instead of replacing the player.
- **A scrub affordance needs to be visible and keyboard-operable.** A bare waveform image with an `onClick` is not a scrubber a user can find. Ship a labelled range control (drag + arrow/Home/End) and a playhead, and keep the waveform click as a bonus.

## Dogfood (2026-11-21)

- **Screen recordings are often silent.** `showwavespic` fails on an input with no audio stream, so the waveform endpoint must degrade to a flat line instead of returning 500. A missing waveform should cost the drawing, not the player.
- **Demo footage must not show an older build.** A how-to recorded against the previous UI teaches the wrong interface. Generate neutral footage for the fixture, or re-record the demo after a redesign.
- **Compose captions from recorded step times.** The recorder writes each step's start time; the composer burns captions with `enable='between(t,…)'`. Captions then stay in sync even when a step is slow.
- **Scope automation to the navigation.** Transcript words and chrome can share names ("Deliver"); `getByRole("button", { name: "Deliver" })` becomes ambiguous. Scope to the mode nav in tests and recorders.
- **A 17-second how-to is enough to expose a defect.** The silent-media 500 and the old-footage problem both surfaced in a single run; running the product beats reading the tests.

## Media Import (2026-11-22)

- **A picker needs its own listing mode.** Keep the project browser folder-only by default, and ask for files explicitly (`includeFiles=1`). Filtering by media extension keeps the dialog usable in a folder full of source files.
- **Open the picker where the user already is.** Starting at the project browser's current folder reuses context; starting at home forces the user to walk back.
- **Choosing is not importing.** Fill the source field on choose and let the user press Import copy; it keeps the copy explicit and reversible.
- **Scope modal automation to the dialog.** A modal sits over a page with rows carrying the same titles; `getByTitle("Enter media")` matches both. Use `role="dialog"` as the scope.
- **Fixture names must match the UI-derived folder.** "Imported take" becomes a folder with a space; cleaning `imported-take` leaves the previous run in place and the second run fails on "already exists".

## Deliver First Run (2026-11-22)

- **An empty state must offer the action that creates its content.** "Render preview" with no scenes can only plan nothing. Build the first storyboard from the transcript, then preview it in the same click.
- **Derive the first scenes from what the user already has.** Segments are the natural scene boundary; removed words must not anchor a scene, and a segment emptied by removals is dropped.
- **Hide actions that cannot work.** The preview buttons now appear only once scenes exist; before that the single action is Create storyboard, so there is no dead end.
