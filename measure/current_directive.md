# Current Directive

**Completed (2026-11-20):** `rewrite_ts_vinext_20261120` — the GTK4/GStreamer/Go application has been replaced by a TypeScript application (vinext Pages Router + React 19 + Node + FFmpeg). All nine phases are done; `npm run check` is green with 175 tests, including a real FFmpeg export and an end-to-end import → transcript → delete → export flow. The Go implementation is deleted and its tracks are archived.

## Next

**Active track:** `storyboard_compositor_20261120`.

The rewrite met its gate (cut-list export), so this track is unblocked. Before implementation:

1. Refresh its `spec.md` and `plan.md` stack references — they still name `internal/storyboard`, `internal/compose`, and GStreamer elements from the retired implementation.
2. Re-scope phases to the new packages (`packages/storyboard`, `packages/slides`, `apps/web`).
3. Confirm the Remotion licensing decision in OD2 is still moot: personal use only, so the free tier applies.

## Standing rules

- **Personal use.** No distribution, no telemetry, accounts, or cloud sync.
- **Client-first.** Pages Router, client components, route handlers. No RSC.
- **Pure builders.** Filtergraphs, anchors, patches, and hashing are pure functions with unit tests; subprocess and filesystem access are injected.
- **No vendor SDKs outside `packages/ai`.**
- **Measure.** Update `measure/tracks.md` and the active `plan.md` before and after work.
