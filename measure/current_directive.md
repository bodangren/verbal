# Current Directive

**Completed (2026-11-20):** first-release features. One page wires project create/open → capture/import → transcript → storyboard load/save → fast/full preview → patch review → export, and green-screen capture records un-keyed footage with a live key-quality warning. Verified over live HTTP: a real export produced a 7-second file with provenance, and a capture without a camera failed cleanly with no partial file.

## Next

**Active track:** `storyboard_compositor_20261120`.

Remaining units, in order:

1. **Phase 10 — generated images (Stage 2).** A provider interface inside `packages/ai`, immutable content-addressed image assets, `generated-image` scenes rendered through the existing renderer unchanged, and cost approval before generation.
2. **Phase 11 — generated video (Stage 3).** Queued, cancellable clip generation with placeholders, reusing the same asset model.
3. **Hardware verification.** Capture's success path needs a machine with a V4L2 camera; it is the only unverified part of FR1.
4. **Browser interaction walkthrough.** The flow is HTTP-verified; nobody has clicked through it yet.

## Standing rules

- **Personal use.** No distribution, no telemetry, accounts, or cloud sync.
- **Client-first.** Pages Router, client components, route handlers. No RSC.
- **Pure builders.** Filtergraphs, anchors, patches, hashing, capture argv, and key-quality are pure functions with unit tests; subprocess and filesystem access are injected.
- **No vendor SDKs outside `packages/ai`.**
- **Browser-safe package roots.** Anything a React component imports must not pull `node:crypto` or Node built-ins; such code lives behind subpaths (`@verbal/storyboard/hash`, `@verbal/media/key-quality`, `@verbal/cleanup/freeze`).
- **Prefer the parsed body.** vinext populates `req.body`; reading the request stream instead yields nothing.
- **Measure.** Update `measure/tracks.md` and the active `plan.md` before and after work.
