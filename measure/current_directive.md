# Current Directive

**Completed (2026-11-20):** Stage 2 — generated images. An image provider sits in `packages/ai` with a purely local cost estimate; assets are content-addressed with provenance; `generated-image` scenes composite the stored image without starting Remotion; and generation is gated behind a visible price. Verified live against a fake OpenAI-compatible server: estimate → generate → asset on disk → scene updated → 7-second export.

## Next

**Active track:** `storyboard_compositor_20261120`.

Remaining units, in order:

1. **Phase 11 — generated video (Stage 3).** Queued, cancellable clip generation with placeholders, reusing the same content-addressed asset model. `generated-video` scenes should flow through the step adapter the same way images do.
2. **Hardware verification.** Capture's success path needs a machine with a V4L2 camera.
3. **Browser interaction walkthrough.** Everything is HTTP- and unit-verified; nobody has clicked through the page yet.

## Standing rules

- **Personal use.** No distribution, no telemetry, accounts, or cloud sync.
- **Client-first.** Pages Router, client components, route handlers. No RSC.
- **Pure builders.** Filtergraphs, anchors, patches, hashing, capture argv, key-quality, and cost estimates are pure functions with unit tests; subprocess and filesystem access are injected.
- **No vendor SDKs outside `packages/ai`.** ASR, LLM, image, and video providers all live there.
- **Browser-safe package roots.** Anything a React component imports must not pull `node:crypto` or Node built-ins; such code lives behind subpaths (`@verbal/storyboard/hash`, `@verbal/media/key-quality`, `@verbal/cleanup/freeze`).
- **Price before you generate.** An estimate must be local and shown before any paid call.
- **Prefer the parsed body.** vinext populates `req.body`; reading the request stream instead yields nothing.
- **Measure.** Update `measure/tracks.md` and the active `plan.md` before and after work.
