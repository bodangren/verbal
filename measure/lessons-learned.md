# Lessons Learned

> Greenfield reset. Entries below are timeless principles carried into the rewrite. Remove or replace as the new implementation matures.

## Go + GTK4 + GStreamer

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

## General

- **MVP First:** Build the smallest end-to-end flow (record/import → transcribe → playback → delete word → export) before adding advanced features.
- **Tests Before UI:** Verify media pipeline correctness with real fixtures before wiring it to GTK widgets.
- **Keep main.go Small:** The application controller belongs in `internal/app`, not the entry point.
