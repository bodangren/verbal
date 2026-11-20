# Current Directive

**Active track:** `rewrite_ts_vinext_20261120` — replace the GTK4/GStreamer/Go application with a TypeScript application (vinext + React + FFmpeg + Remotion).

**This supersedes every prior directive.** All previous architectural decisions are eligible to be changed; the retired-stack tracks in `measure/tracks.md` are historical reference only and must not be implemented as written.

## Order of work

1. **Rewrite** (`rewrite_ts_vinext_20261120`): project format, import/probe, transcript editor, cut list, FFmpeg export, playback sync, provider abstraction. This is the shell plus the editing core.
2. **Storyboard compositor** (`storyboard_compositor_20261120`): unblocked once the rewrite reaches cut-list export. Its product decisions — storyboard IR, word-span anchors, patches, two-tier preview, brand kit, asset ladder — carry over unchanged; only its stack references need refreshing.
3. **Asset ladder**, in order: Remotion motion slides → generated images → generated video.

## Standing rules for the rewrite

- **Port concepts, not code.** The Go implementation is a specification, not a source of lines.
- **Do not delete the Go tree until Phase 5 has parity** on import → transcript → cut → export. After that, remove it in a single commit so the repository has one implementation.
- **Personal use.** No distribution, no licensing blockers; do not add telemetry, accounts, or cloud sync.
- **Client-first.** Pages Router, client components, route handlers for the local API. No RSC.
- **Pure builders.** Filtergraphs, anchors, and patches are pure functions with unit tests. Anything that touches the filesystem or a subprocess is thin and injected.

## Deferred

- Electron wrapper — optional, after the local web app is usable.
- Multi-range delete/reorder, undo/redo, waveform, filler detection, search, batch queue, presets, real-time transcription, local offline transcription, auto-save, backup/repair — all remain product goals, but they are re-planned on the new stack. Do not revive the old track plans.
