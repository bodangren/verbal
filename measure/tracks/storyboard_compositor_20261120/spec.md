# Specification: Storyboard Compositor

> **Stack refresh (2026-11-20).** This spec was first written against the retired GTK/GStreamer implementation. The product decisions are unchanged; the stack references now target the TypeScript application (`packages/storyboard`, `packages/compose`, `tools/remotion`, FFmpeg). The rewrite track is complete, so the previous dependency gate is met.

## Overview

Verbal edits a single talking-head recording by editing its transcript. This track adds the second half of the production workflow: turning a cleaned talking-head master into a finished explainer video by compositing animated slides, graphics, and a music bed around the speaker.

The user records against a green screen, so the speaker can be cut out and placed over any slide. The LLM acts as a *director*: it proposes storyboard scenes anchored to the transcript and drafts the content of each slide. It never renders, never computes timecodes, and never touches FFmpeg.

### Core invariant

**The LLM emits a declarative storyboard IR. Rendering is deterministic and LLM-free.**

Everything else follows from that: reproducibility, scene-level caching, undo, diffing, cheap re-preview, and regression tests.

### Asset ladder

| Stage | Asset source | Determinism | Cost / latency | Plan phase |
| --- | --- | --- | --- | --- |
| 1 | Remotion motion slides (React → PNG frames) | Deterministic given props | Seconds, offline | Phase 4 |
| 2 | Generated images (cloud) | Stochastic; pinned by content hash | Slow, paid | Phase 10 |
| 3 | Generated video clips (cloud) | Stochastic; pinned by content hash | Slowest, most expensive | Phase 11 |

## Goals

1. Capture or import green-screen footage with a live key preview and a key-quality warning.
2. Turn LLM cleanup proposals into a **reviewable diff** over words, and freeze the result as a cleaned master plus an immutable anchor index.
3. Model a storyboard as a versioned, patchable document whose scenes are anchored to *word spans*, not timecodes (`packages/storyboard`).
4. Render each storyboard scene to an alpha-preserving PNG sequence through a Remotion worker, with a content-addressed cache (`packages/compose`, `tools/remotion`).
5. Composite the keyed speaker plus slide, title, and graphics layers with FFmpeg filtergraphs, including a music bed and ducking (`packages/compose`).
6. Offer two preview tiers (fast cut-only, full composite) generated from the same IR.
7. Accept feedback as timeline-anchored comments and chat, converting it into reviewable storyboard patches.
8. Export with a brand kit (title, outro, contact card, lower thirds, music, loudness target, provenance manifest).

## Non-Goals

- **Non-green-screen footage and automatic matting.** V1 requires a green screen; background removal is out of scope.
- **LLM-authored arbitrary React components.** V1 ships a typed template pack; an authoring escape hatch is a later decision (see OD1).
- **Real-time composite rendering while editing.** Preview is a render, not a live compositor.
- **Multi-user collaboration, cloud project sync, or a web app.**
- **Automatic b-roll sourcing** from stock libraries.
- **Changing `packages/media` cut-list semantics.** Cleanup consumes the existing cut list; it does not re-implement it.

## Functional Requirements

### FR1: Green-screen capture and key preview
- Capture uses FFmpeg (`v4l2` for video, `pulse` for audio) as a subprocess, writing the **un-keyed** source.
- The capture UI previews the feed in a `<video>` element and shows a chroma-key preview on a `<canvas>` with a selectable key colour and tolerance.
- A quality warning reports spill, uneven lighting, and low edge contrast.
- Keying is never baked into the recorded source.

### FR2: Cleanup proposals
- The cleanup engine emits *proposals*, each a word-ID range plus a category: `stutter`, `filler`, `dead-air`, `false-start`, `repetition`.
- Proposals never carry timecodes; resolution against the anchor index happens in code.
- The user can accept all, accept per category, or toggle individual proposals, with a global aggressiveness setting.
- Audio-fix proposals (hum, rumble, level) are surfaced as badges, separate from word deletion.
- Every accepted deletion records a **visual-cover suggestion** (punch-in, cutaway, or slide) so the resulting jump cut is not naked.

### FR3: Frozen master and anchor index
- Approving cleanup produces two artifacts: the cleaned master media and an anchor index.
- The anchor index maps every surviving word ID to its source time range and to its time range in the cleaned master.
- The index is immutable for a given master; downstream stages may not re-time it.
- Re-running cleanup creates a new master and index; the storyboard must be re-anchored explicitly.

### FR4: Storyboard IR
- A storyboard is a versioned JSON document: an ordered list of scenes (`packages/storyboard`).
- Each scene carries: `id`, an anchor (`startWordId`, `endWordId`), a visual kind (`talk`, `slide`, `static`, `generated-image`, `generated-video`), a layer mode (`full-frame`, `speaker-inset`, `side-by-side`), an optional asset reference, an optional template, template props, and an optional transition.
- Anchor-to-time resolution uses the frozen anchor index and is performed by `packages/storyboard`, never by the LLM.
- The document validates on load: unresolved word IDs, unknown visual kinds, duplicate scene IDs, and incomplete anchors are errors.
- Scenes carry a content hash covering template, props, asset ID, duration, and output geometry. The hash excludes the scene ID so moving a scene does not invalidate its render.

### FR5: Slide rendering worker
- A scene contract is passed to a Remotion renderer running as a **Node child process** from `tools/remotion`, which returns an alpha-preserving PNG frame sequence plus a manifest.
- Remotion is imported only inside `tools/remotion`; no Remotion type appears in application code.
- Rendered output is cached on disk, keyed by scene content hash. A cache hit does not start the renderer.
- A render failure yields a visible placeholder scene and a surfaced error; it never blocks the rest of the render.
- Render requests are cancellable and bounded by a timeout.

### FR6: Compositing
- The renderer composes the keyed speaker and zero or more slide/graphic layers with FFmpeg filtergraphs (`chromakey`, `despill`, `scale`, `overlay`).
- Layer modes are supported: full-frame slide (speaker hidden), speaker inset over slide, and side-by-side.
- Title cards and lower thirds are layers, driven from the brand kit (`drawtext` or pre-rendered PNGs from the slide worker).
- Audio: speaker stream plus an optional music bed, with ducking (`sidechaincompress`) and a target loudness stage (`loudnorm`).
- The filtergraph is produced by a pure function returning an argv array and is unit-testable without a display or media.

### FR7: Preview tiers
- **Fast preview** renders the cut list plus static and already-cached slide layers; it must not start new slide renders.
- **Full preview** renders the complete composite.
- Both derive from the same IR and are labelled with a monotonically increasing version number.
- Switching preview tiers must not require an LLM call.

### FR8: Feedback and versioning
- The user can attach a comment to a timeline position or a scene.
- Chat messages are converted into storyboard patches, never into direct renders.
- A patch is presented as a diff against the current storyboard version, with per-hunk accept/reject.
- Every accepted patch creates a new storyboard version; versions are revertible.
- Patch application and reversion are covered by round-trip tests.

### FR9: Export and brand kit
- Export renders the approved version plus brand-kit elements: title card, outro, contact card, lower thirds, music bed.
- Loudness is normalised to a selected platform target.
- Export writes a provenance manifest listing every asset, its source, and its content hash.
- Export reuses the job registry and the FFmpeg runner from the rewrite.
- Export presets reuse the existing media codec options.

### FR10: Generated-image assets (Stage 2)
- An asset is addressed by `sha256(prompt, provider, model, seed, params)`.
- Generated assets are immutable and stored in the project; regeneration mints a new asset.
- Scene rendering treats a generated asset exactly like a static image, so the render path is unchanged.
- The storyboard diff shows an asset swap as a normal change, not a silent mutation.

### FR11: Generated-video assets (Stage 3)
- Generated clips use the same immutable, content-addressed asset model.
- Clip generation is queued and cancellable, with per-scene cost shown before approval.
- A placeholder is shown for pending scenes so the rest of the storyboard remains previewable.

## Acceptance Criteria

- [ ] A green-screen recording can be captured with a live key preview and produces an un-keyed source file.
- [ ] Cleanup proposals resolve to time ranges from word IDs only.
- [ ] Approving cleanup freezes a master plus an anchor index, and re-running cleanup requires explicit re-anchoring.
- [ ] A storyboard document validates on load and rejects unresolved anchors, unknown visual kinds, and duplicate scene IDs.
- [ ] Scene content hashes are stable across process restarts, independent of key order and of the scene ID.
- [ ] A cached scene render does not start the Remotion worker.
- [ ] A render failure produces a placeholder and does not abort the composite.
- [ ] The composite filtergraph builder produces the correct chain for all three layer modes, verified headlessly.
- [ ] Fast preview starts zero new slide renders.
- [ ] A chat message produces a patch that can be accepted, rejected, and reverted; the round trip restores the prior IR byte-for-byte.
- [ ] Export produces a file with title, outro, contact card, music bed, and a provenance manifest.
- [ ] `npm run check` passes.

## Non-Functional Requirements

- **NFR1 Determinism:** the same storyboard version plus the same assets produce identical output bytes, modulo encoder metadata. Hashes are stable across runs.
- **NFR2 LLM isolation:** no LLM call exists on the render path. Rendering works with the network disabled.
- **NFR3 Local-first media:** all compositing and rendering is local. Cloud is used only for ASR, LLM planning, and Stage 2/3 asset generation.
- **NFR4 Graceful degradation:** a missing renderer, Chromium, or asset degrades to a placeholder with a clear message.
- **NFR5 UI responsiveness:** render and generation work runs in the job registry, never in a request handler or a React render.
- **NFR6 Disk discipline:** master, per-scene cache, and per-version renders each have a documented retention policy.
- **NFR7 Security:** the renderer runs with a pinned dependency set and no ambient credentials. No render-time npm installs.

## Dependencies

| Dependency | Status |
| --- | --- |
| `rewrite_ts_vinext_20261120` | **Complete.** Provides the project format, transcript model, cut list, FFmpeg runner, job registry, and provider abstraction. |
| FFmpeg / ffprobe | Present and used throughout. |
| Remotion + headless Chromium | Added by this track (Phase 4). |

## Open Decisions

- **OD1 — Who authors slide templates?** V1 uses a typed template pack plus props (safe, cacheable, no code execution at runtime). Letting the LLM author React components per project is more expressive but requires a sandbox, a pinned import allowlist, and per-project dependency installation. **Recommendation:** template pack first.
- **OD2 — Remotion licensing.** **Resolved:** the application is for personal use, so Remotion's free tier applies. Revisit only if this is ever distributed.
- **OD3 — Renderer packaging.** Remotion needs Node and headless Chromium. Two options: bundle them with the app, or treat the renderer as developer-provided. Recommendation for V1: the renderer is a local child process using the project's own Node; Chromium is downloaded once by Remotion and cached. Record the disk cost.
- **OD4 — Render cost.** Headless rendering on Linux typically uses software GL. Measure a 60-second slide at 1080p30 (1,800 frames) before promising preview latency.

## Risks

- **R1 — Timestamp accuracy.** ASR word boundaries are off by tens of milliseconds; cuts need handles and audio ramps (already implemented in the cut list).
- **R2 — Naked jump cuts.** Every cleanup deletion changes the visual; without cover suggestions the result feels machine-gunned.
- **R3 — Cache invalidation.** Duration is part of the content hash, so any anchor change re-renders that scene. Mitigate by rendering a natural length plus a hold tail and trimming at composite time.
- **R4 — Packaging.** Chromium is a large dependency; see OD3.
- **R5 — Determinism drift.** Fonts, Chromium versions, and FFmpeg versions must be pinned or "identical output" will not hold.
- **R6 — Disk growth.** Masters, per-scene cache, and versioned renders multiply quickly.
- **R7 — Legal exposure for generated footage.** The provenance manifest documents provenance; it does not settle disclosure requirements.
