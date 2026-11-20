# Current Directive

**All planned phases are complete (2026-11-20).**

- **Rewrite track:** complete. GTK/GStreamer/Go retired; the TypeScript application replaced it.
- **Storyboard track:** complete through Phase 11 — transcript editing, green-screen capture, cleanup review, storyboard IR, Remotion slides, two-tier preview, feedback/patches, brand-kit export, generated images, and generated video.

`npm run check` is green with 418 tests. Both asset stages and the export path were verified live over HTTP with fake providers and real Remotion + FFmpeg.

## What remains (not implementable here)

1. **Capture on hardware.** This machine has no V4L2 camera; the failure path is live-tested, the success path is not.
2. **Browser walkthrough.** Every flow is HTTP- and unit-verified; nobody has clicked through the page.
3. **Real paid provider calls.** ASR, LLM, image, and video providers are tested against fakes and fake servers.

## Known debt

- Generated assets are never pruned (`assets/generated/` grows monotonically).
- Export always re-encodes the cut list.
- Slide renders use the exact scene duration, so an anchor change re-renders that scene.
- The storyboard editor is raw JSON rather than a scene inspector.

## Standing rules

- **Personal use.** No distribution, no telemetry, accounts, or cloud sync.
- **Client-first.** Pages Router, client components, route handlers. No RSC.
- **Pure builders.** Filtergraphs, anchors, patches, hashing, capture argv, key-quality, and cost estimates are pure functions with unit tests; subprocess and filesystem access are injected.
- **No vendor SDKs outside `packages/ai`.**
- **Browser-safe package roots.** Anything a React component imports must not pull Node built-ins; such code lives behind subpaths.
- **Price before you generate.** Estimates are local and shown before any paid call.
- **Prefer the parsed body.** vinext populates `req.body`.
- **Measure.** Update `measure/tracks.md` and the active `plan.md` before and after work.
