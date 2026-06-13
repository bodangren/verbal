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

## General

- **MVP First:** Build the smallest end-to-end flow (record/import → transcribe → playback → delete word → export) before adding advanced features.
- **Tests Before UI:** Verify media pipeline correctness with real fixtures before wiring it to GTK widgets.
- **Keep main.go Small:** The application controller belongs in `internal/app`, not the entry point.
