# Current Directive

**Completed (2026-11-20):** application composition. One page now wires project create/open → media import → transcript → storyboard load/save → fast/full preview planning → patch parsing and apply → storyboard export with job polling. Verified over live HTTP against the standalone server: a real export produced a 7-second file (3 s title + 1 s scene + 3 s outro) with a provenance manifest. `npm run check` is green with 356 tests.

## Next

**Active track:** `storyboard_compositor_20261120`.

Remaining units, in order:

1. **Browser interaction walkthrough.** The flow is verified over HTTP; nobody has clicked through it in a browser yet. Fix whatever that surfaces.
2. **Green-screen capture (spec FR1).** Capture is specified and unimplemented: FFmpeg `v4l2`/`pulse` capture, a live canvas key preview, and a key-quality warning.
3. **Phase 10/11 asset ladder** — generated images, then generated video, behind immutable content-addressed assets.

## Standing rules

- **Personal use.** No distribution, no telemetry, accounts, or cloud sync.
- **Client-first.** Pages Router, client components, route handlers. No RSC.
- **Pure builders.** Filtergraphs, anchors, patches, and hashing are pure functions with unit tests; subprocess and filesystem access are injected.
- **No vendor SDKs outside `packages/ai`.**
- **Browser-safe package roots.** Anything a React component imports must not pull `node:crypto`; hashing lives behind subpaths (`@verbal/storyboard/hash`, `@verbal/cleanup/freeze`).
- **Prefer the parsed body.** vinext populates `req.body`; reading the request stream instead yields nothing.
- **Measure.** Update `measure/tracks.md` and the active `plan.md` before and after work.
