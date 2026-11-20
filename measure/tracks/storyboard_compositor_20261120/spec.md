# Specification: Storyboard Compositor

> **⚠️ Stale stack references (2026-11-20).** This spec was written against the retired GTK/GStreamer/Go implementation. Its *product* decisions — storyboard IR, word-span anchors, patches/diff, two-tier preview, brand kit, and the motion-slides → generated-images → generated-video ladder — carry over unchanged. Its *stack* references (`internal/storyboard`, `internal/compose`, GStreamer `compositor`/`alpha`, the Remotion sidecar) must be refreshed before implementation. The track is blocked on `rewrite_ts_vinext_20261120` reaching cut-list export.

## Overview

Verbal today edits a single talking-head recording by editing its transcript. This track adds the other half of the production workflow: turning a cleaned talking-head master into a finished explainer video by compositing animated slides, graphics, and a music bed around the speaker.

The user records against a green screen, so the speaker can be cut out and placed over any slide. The LLM acts as a *director*: it proposes storyboard scenes anchored to the transcript and drafts the content of each slide. It never renders, never computes timecodes, and never touches GStreamer.

### Core invariant

**The LLM emits a declarative storyboard IR. Rendering is deterministic and LLM-free.**

Everything else follows from that: reproducibility, scene-level caching, undo, diffing, cheap re-preview, and regression tests.

### Asset ladder

The three asset sources are deliberately graded by cost and determinism. Each stage reuses the same storyboard IR and renderer; only the *asset source* changes.

| Stage | Asset source | Determinism | Cost / latency | Track phase |
| --- | --- | --- | --- | --- |
| 1 | Remotion motion slides (React → PNG frames) | Deterministic given props | Seconds, offline | Phase 4 |
| 2 | Generated images (cloud) | Stochastic; pinned by content hash | Slow, paid | Phase 10 |
| 3 | Generated video clips (cloud) | Stochastic; pinned by content hash | Slowest, most expensive | Phase 11 |

## Goals

1. Capture or import green-screen footage with a live chroma-key preview and a key-quality warning.
2. Turn LLM cleanup proposals into a **reviewable diff** over words, and freeze the result as a cleaned master plus an immutable anchor index.
3. Model a storyboard as a versioned, patchable document whose scenes are anchored to *word spans*, not timecodes.
4. Render each storyboard scene to an alpha-preserving asset through a Remotion sidecar, with a content-addressed cache.
5. Composite the keyed speaker plus slide, title, and graphics layers in GStreamer, with a music bed and ducking.
6. Offer two preview tiers (fast cut-only, full composite) generated from the same IR.
7. Accept feedback as timeline-anchored comments and chat, converting it into reviewable storyboard patches.
8. Export with a brand kit (title, outro, contact card, lower thirds, music, loudness target, provenance manifest).

## Non-Goals

- **Non-green-screen footage and automatic matting.** V1 requires a green screen; background removal is out of scope.
- **LLM-authored arbitrary React components.** V1 ships a typed template pack; an authoring escape hatch is a later decision (see OD1).
- **Real-time composite rendering while editing.** Preview is a render, not a live compositor.
- **Multi-user collaboration, cloud project sync, or a web app.**
- **Automatic b-roll sourcing** from stock libraries.
- **Changing `internal/edit` semantics.** Cleanup consumes the existing edit operations; it does not re-implement them.

## Functional Requirements

### FR1: Green-screen capture and key preview
- Recording uses the existing `v4l2src` / `pulsesrc` capture path.
- The capture UI shows a live chroma-key preview with the selected key colour and tolerance.
- A quality warning reports spill, uneven lighting, and low edge contrast, and suggests corrective action.
- Recording writes the **un-keyed** source; keying is never baked in.

### FR2: Cleanup proposals
- The cleanup engine emits *proposals*, each a word-ID range plus a category: `stutter`, `filler`, `dead-air`, `false-start`, `repetition`.
- Proposals never carry timecodes; resolution against the anchor index happens in Go.
- The user can accept all, accept per category, or toggle individual proposals, with a global aggressiveness setting.
- Audio-fix proposals (hum, rumble, level) are surfaced as badges, separate from word deletion.
- Every accepted deletion records a **visual-cover suggestion** (punch-in, cutaway, or slide) so the resulting jump cut is not naked.

### FR3: Frozen master and anchor index
- Approving cleanup produces two artifacts: the cleaned master media and an anchor index.
- The anchor index maps every surviving word ID to its source media time range and to its time range in the cleaned master.
- The index is immutable for a given master; downstream stages may not re-time it.
- Re-running cleanup creates a new master and a new index; the storyboard must be re-anchored explicitly.

### FR4: Storyboard IR
- A storyboard is a versioned JSON document: an ordered list of scenes.
- Each scene carries: `id`, an anchor (`startWordID`, `endWordID`), a visual kind (`talk`, `slide`, `static`, `generated-image`, `generated-video`), an optional asset reference, a layer mode (`full-frame`, `speaker-inset`, `side-by-side`), an optional transition, and template props.
- Anchor-to-time resolution uses the frozen anchor index and is performed by `internal/storyboard`, never by the LLM.
- The document validates on load: unresolved word IDs, unknown visual kinds, and asset references to missing assets are errors.
- Scenes carry a content hash covering template, props, asset ID, duration, and output geometry.

### FR5: Slide rendering sidecar
- A scene contract is passed to a Remotion sidecar as JSON; the sidecar returns an alpha-preserving PNG frame sequence plus a manifest.
- The sidecar is invoked as a subprocess; it is not linked into the Go binary.
- Rendered output is cached on disk, keyed by scene content hash. A cache hit does not invoke Node.
- A sidecar failure yields a visible placeholder scene and a surfaced error; it never blocks the rest of the render.
- Render requests are cancellable and bounded by a timeout.

### FR6: Compositing
- The renderer composes the keyed speaker and zero or more slide/graphic layers via GStreamer (`compositor` or `glvideomixer`), using `alpha` for keying.
- Layer modes are supported: full-frame slide (speaker hidden), speaker inset over slide, and side-by-side.
- Title cards and lower thirds are layers, driven from the brand kit.
- Audio: speaker stream plus an optional music bed, with ducking (`sidechaincompress`) and a target loudness stage.
- The pipeline description is produced by a pure function and is unit-testable without a display.

### FR7: Preview tiers
- **Fast preview** renders the cut list plus static and already-cached slide layers; it must not trigger new slide renders.
- **Full preview** renders the complete composite.
- Both are derived from the same IR and are labelled with a monotonically increasing version number.
- Switching between preview tiers must not require an LLM call.

### FR8: Feedback and versioning
- The user can attach a comment to a timeline position or a scene.
- Chat messages are converted into storyboard patches, never into direct renders.
- A patch is presented as a diff against the current storyboard version, with per-hunk accept/reject.
- Every accepted patch creates a new storyboard version; versions are revertible.
- Patch application and reversion are covered by round-trip tests.

### FR9: Export and brand kit
- Export renders the approved version plus brand-kit elements: title card, outro, contact card, lower thirds, music bed.
- Loudness is normalised to a selected platform target.
- Export writes a provenance manifest listing every asset, its source (template, generated prompt, or user file), and its content hash.
- Export presets reuse the existing `internal/media` preset machinery.

### FR10: Generated-image assets (Stage 2)
- An asset is addressed by `sha256(prompt, provider, model, seed, params)`.
- Generated assets are immutable and stored in the project; regeneration mints a new asset.
- Scene rendering treats a generated asset exactly like a static image, so the render path is unchanged.
- The storyboard diff shows an asset swap as a normal change, not a silent mutation.

### FR11: Generated-video assets (Stage 3)
- Generated clips use the same immutable, content-addressed asset model as FR10.
- Clip generation is queued and cancellable, with per-scene cost shown before approval.
- A placeholder is shown for pending scenes so the rest of the storyboard remains previewable.

## Acceptance Criteria

- [ ] A green-screen recording can be captured with a live key preview and produces an un-keyed source file.
- [ ] Cleanup proposals resolve to time ranges from word IDs only; no timecode is supplied by the LLM.
- [ ] Approving cleanup freezes a master plus an anchor index, and re-running cleanup requires explicit re-anchoring.
- [ ] A storyboard document validates on load and rejects unresolved anchors and unknown visual kinds.
- [ ] Scene content hashes are stable across process restarts and map-iteration order.
- [ ] A cached scene render does not spawn a Node process.
- [ ] A sidecar failure produces a placeholder and does not abort the render.
- [ ] The compositor pipeline builder produces the correct element chain for all three layer modes, verified headlessly.
- [ ] Fast preview triggers zero new slide renders.
- [ ] A chat message produces a patch that can be accepted, rejected, and reverted; the round trip restores the prior IR byte-for-byte.
- [ ] Export produces a file with title, outro, contact card, music bed, and a provenance manifest.
- [ ] `make check` passes.

## Non-Functional Requirements

- **NFR1 Determinism:** The same storyboard version plus the same assets produce identical output bytes (modulo encoder metadata). Content hashes are stable across runs.
- **NFR2 LLM isolation:** No LLM call exists on the render path. Rendering works with the network disabled.
- **NFR3 Local-first media:** All compositing and rendering is local. Cloud is used only for ASR, LLM planning, and (Stage 2/3) asset generation.
- **NFR4 Graceful degradation:** A missing sidecar, missing Node, or missing asset degrades to a placeholder with a clear message.
- **NFR5 UI responsiveness:** Render and generation work runs off the GTK main loop; UI updates go through `glib.IdleAdd`.
- **NFR6 Disk discipline:** Proxy, master, per-scene cache, and per-version renders each have a documented retention policy.
- **NFR7 Security:** The sidecar runs with no ambient credentials and a pinned dependency set. No render-time npm installs.

## Dependencies

| Dependency | Why it blocks this track |
| --- | --- |
| `mvp_transcription_20260612` | Word-level timestamps are the anchor index's only input. |
| `mvp_text_delete_20260612` | Cleanup consumes the cut list the delete operation produces. |
| `mvp_playback_sync_20260612` | Preview playback and word highlighting reuse the sync controller. |
| tracks.md integrity flag (2026-06-21) | Legacy implementations must be reconciled or deleted before the MVP tracks can be trusted as prerequisites. |

Phase 0 of this plan is a gate on these, not a re-implementation.

## Open Decisions

- **OD1 — Who authors slide templates?** V1 uses a typed template pack plus props (safe, cacheable, no code execution at runtime). Letting the LLM author React components per project is more expressive but requires a sandbox, a pinned import allowlist, and per-project dependency installation. **Recommendation:** template pack in V1, authoring escape hatch only if the pack proves too limiting.
- **OD2 — Remotion licensing.** Remotion is free for individuals and companies up to three people. Entities outside that need a Company License, and products in the "video editors, prompt-to-video apps" category fall under *Remotion for Automators* (per-render pricing, monthly minimum). Verified 2026-11-20 at remotion.dev/license. **This is a business decision, not an engineering one**, and it must be settled before distributing a commercial build.
- **OD3 — Sidecar packaging.** Either bundle Node plus headless Chromium (large, complicates Flatpak), or make the sidecar optional and pre-render assets on another machine. V1 may treat it as a developer-only sidecar while the contract stabilises.
- **OD4 — Chromium render cost.** Headless rendering on Linux typically uses software GL. A 60-second slide at 1080p30 is 1,800 frames; measure before promising interactive preview latency.

## Risks

- **R1 — Timestamp accuracy.** ASR word boundaries are off by tens of milliseconds; cuts need VAD-derived handles and audio ramps or they click.
- **R2 — Naked jump cuts.** Every cleanup deletion changes the visual; without cover suggestions the result feels machine-gunned.
- **R3 — Cache invalidation.** Duration is part of the content hash, so any anchor change re-renders that scene. Mitigate by rendering a natural length plus a hold tail and trimming at composite time.
- **R4 — License and packaging.** See OD2/OD3.
- **R5 — Determinism drift.** Fonts, Chromium versions, and GStreamer versions must be pinned or "identical output" will not hold.
- **R6 — Disk growth.** Masters, proxies, per-scene cache, and versioned renders multiply quickly.
- **R7 — Legal exposure for generated footage.** The provenance manifest documents provenance; it does not settle disclosure requirements.
