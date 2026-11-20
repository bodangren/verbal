# Current Directive

**Completed (2026-11-20):** the storyboard compositor's first-release **pipeline** (Phases 0–9). A storyboard now renders end to end: Remotion slides → FFmpeg composite → stream-copy concat → one file, with brand bookends, ducked music, a loudness target, and a provenance manifest. `npm run check` is green with 346 tests, including two opt-in Remotion end-to-end tests.

## Next

**Active track:** `storyboard_compositor_20261120`.

The remaining unit is **composition**, not more pipeline:

1. A page that wires the tested pieces together: project → import → transcript → storyboard → preview → export.
2. Repository wiring for the storyboard: load/save `storyboard.json` and `comments.json` through `packages/storyboard`.
3. An HTTP surface for storyboard preview and export jobs, reusing `runStoryboardExport`.

Known gaps to keep visible:

- The storyboard track is **not** complete: Phase 9's manual browser walkthrough was not performed because no composed page exists.
- Green-screen capture (spec FR1) is specified but not built.
- The Phase 10/11 asset ladder (generated images, generated video) is unstarted.

## Standing rules

- **Personal use.** No distribution, no telemetry, accounts, or cloud sync.
- **Client-first.** Pages Router, client components, route handlers. No RSC.
- **Pure builders.** Filtergraphs, anchors, patches, and hashing are pure functions with unit tests; subprocess and filesystem access are injected.
- **No vendor SDKs outside `packages/ai`.**
- **Browser-safe package roots.** Anything a React component imports must not pull `node:crypto`; hashing lives behind subpaths (`@verbal/storyboard/hash`, `@verbal/cleanup/freeze`).
- **Measure.** Update `measure/tracks.md` and the active `plan.md` before and after work.
