# Plan: Storyboard Compositor

**Status:** IN PROGRESS
**Created:** 2026-11-20
**Focus:** Turn a cleaned green-screen talking head into a storyboard-driven explainer video.

> **Scope discipline.** Phases 1–9 are the first release (Remotion motion slides). Phases 10–11 (generated images and video) reuse the same IR and renderer and must not change the Phase 1–6 contracts.

> **Gate:** met. `rewrite_ts_vinext_20261120` is complete (project format, transcript model, cut list, FFmpeg runner, job registry, providers).

---

## Phase 0: Stack refresh, contracts, and decisions

- [x] Refresh this spec and plan to the TypeScript stack (`packages/storyboard`, `packages/compose`, `tools/remotion`, FFmpeg).
- [x] Resolve OD2: personal use, so Remotion's free tier applies.
- [x] Decide OD3: the renderer runs as a local Node child process from `tools/remotion`; Chromium is downloaded once by Remotion and cached.
- [x] Freeze the scene-contract JSON schema between `packages/storyboard`, the worker, and `packages/compose`. Treat it as immutable once Phase 2 begins.
- [x] Record the Remotion/Chromium deviation and its disk cost in `measure/tech-stack.md`.

**Exit criteria:** the contract schema is committed; no Phase 2 code before it.

---

## Phase 1: Storyboard IR and anchor resolution

Pure TypeScript, no GTK, no Node rendering. Package: `packages/storyboard`.

### Red
- [x] Failing tests: a storyboard document parses and validates; unknown visual kinds, duplicate scene IDs, and incomplete anchors are rejected.
- [x] Failing tests: anchor resolution maps a word span to a time range against an anchor index; unknown word IDs and reversed anchors are errors, never silent clamps.
- [x] Failing tests: patches support add, remove, move, replace-asset, and update-props; applying a patch then its inverse restores the document byte-for-byte.
- [x] Failing tests: scene hashes are stable across runs, independent of key order and of the scene ID, and change when content changes.

**Targeted Red command:**
```bash
npx vitest run packages/storyboard
```

**Red result:** 3 files failed on missing modules (`./types`, `./parse`, `./anchors`, `./patches`, `./hash`).

### Green
- [x] Implement `types.ts` (document, scene, enums, errors).
- [x] Implement `anchors.ts` (word span → time range, plus an index builder from a transcript).
- [x] Implement `patches.ts` (apply, invert, round-trip).
- [x] Implement `hash.ts` (canonical JSON + SHA-256, excluding the scene ID).
- [x] Implement `parse.ts` (validation and stable serialisation).
- [x] Make tests pass.

**Green result:** 29/29 in `packages/storyboard`; full suite 204/204; `npm run check` exits 0.
- The scene contract is frozen as the `Scene` type plus parser validation: `static` and `generated-*` scenes require an `assetId`; `slide` requires a `template` or an `assetId`; `talk` needs neither.
- `resolveScene` rejects unknown and reversed anchors rather than clamping — a silent clamp would move a scene without anyone asking.
- Every patch has a computed inverse built from the pre-patch document, so add/remove/move/replace-asset/update-props all round-trip byte-for-byte.
- Scene hashes use canonical JSON (sorted keys, undefined dropped) and exclude the scene ID, so renaming or reordering a scene keeps its cached frames.

### Refactor
- [x] Commit: `feat(storyboard): Add storyboard IR, anchors, and patches` — `d0a98ed`

### Adversarial Audit
- [ ] Prove no code path accepts a timecode from a model response.
- [ ] Audit hash stability, patch invertibility, and validation of untrusted documents.

---

## Phase 2: Slide render contract and cache

Package: `packages/compose`. No Chromium required for tests.

### Red
- [x] Failing tests for the `SlideRenderer` interface using a fake: request marshalling matches the frozen schema, and the manifest parses into a typed result.
- [x] Failing tests: cache hit returns the existing sequence without starting the renderer; cache miss starts it exactly once.
- [x] Failing tests: two scenes differing only in duration have different cache keys; identical scenes reuse a key.
- [x] Failing tests: a renderer error yields a placeholder plus an error, and the caller continues.
- [x] Failing tests: cancellation and timeout are honoured.

**Targeted Red command:**
```bash
npx vitest run packages/compose
```

**Red result:** 3 files failed on missing modules (`./types`, `./cache`, `./slides`, `./worker`).

### Green
- [x] Implement the scene-contract types and JSON marshalling.
- [x] Implement the content-addressed on-disk cache.
- [x] Implement the worker client (child process, timeout, cancellation).
- [x] Make tests pass.

**Green result:** 19/19 in `packages/compose`; full suite 223/223; `npm run check` exits 0.
- `SlideRenderRequest` is the frozen contract: scene id, template, props, duration, fps, width, height. `SlideManifest` describes the produced frames.
- `slideRequestHash` reuses `canonicalJson` from `@verbal/storyboard`; it covers template, props, duration, and geometry but excludes the scene id, so reordering keeps cached frames.
- `renderSceneSlide` serves a cache hit without invoking the renderer, records the manifest on a miss, turns renderer failures into placeholders, and propagates cancellation/timeouts rather than masking them.
- `createFileSlideCache` stores one directory and one atomically written manifest per hash; corrupt manifests read as a miss.
- `createProcessRenderer` serialises the request to the child's stdin, parses the manifest from stdout, and enforces a timeout and caller cancellation. The process runner is injected, so the real spawner can land with Remotion in Phase 4.

### Refactor
- [x] Commit: `feat(compose): Add slide renderer contract and content-addressed cache` — `a9b06be`

---

## Phase 3: FFmpeg composite builder

### Red
- [ ] Failing tests: keyed speaker plus full-frame slide, speaker-inset, and side-by-side produce distinct, correct filtergraphs.
- [ ] Failing tests: `chromakey`/`despill` appear with the configured key colour; layer ordering is deterministic.
- [ ] Failing tests: a music bed adds `amix` and `sidechaincompress`; no music omits them.
- [ ] Failing tests: paths never enter the filtergraph; only timestamps and labels do.

### Green
- [ ] Implement the filtergraph builder as a pure function returning argv.
- [ ] Implement layer geometry for the three modes.
- [ ] Implement the audio bed and ducking chain.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(compose): Add composite filtergraph builder`

---

## Phase 4: Remotion template pack

Node subproject in `tools/remotion`, isolated from the app build. Author using the `remotion-best-practices` skill.

- [ ] Scaffold with pinned dependencies and a lockfile.
- [ ] Implement `renderSlide`: JSON in, PNG sequence plus manifest out, alpha preserved.
- [ ] Implement the initial templates: title, section break, bullet reveal, quote, code walkthrough, lower third.
- [ ] Implement "natural length + hold tail" rendering so composite-time trims do not invalidate the cache.
- [ ] Golden tests: props → manifest (frame count, dimensions, alpha, deterministic hash).
- [ ] Document the props schema alongside the frozen contract.

**Exit criteria:** a hand-written storyboard renders end to end to a composited file on a developer machine.

---

## Phase 5: Two-tier preview

- [ ] Red: fast preview never starts the renderer.
- [ ] Red: both tiers derive from the same IR version and are labelled consistently.
- [ ] Green: fast preview (cut list + static and cached layers).
- [ ] Green: full preview (complete composite to a temp file).
- [ ] Green: monotonic preview versions exposed by the project.
- [ ] Commit: `feat(ui): Add two-tier storyboard preview`

---

## Phase 6: Cleanup review UI

- [ ] Red: proposal grouping, per-category acceptance, and aggressiveness application.
- [ ] Green: proposal list with strikethrough words, gap markers, and audio-fix badges.
- [ ] Green: visual-cover suggestion per deletion.
- [ ] Green: freeze-master action producing master + anchor index, with re-anchoring when the master changes.
- [ ] Commit: `feat(ui): Add cleanup review and master freeze`

---

## Phase 7: Feedback, patches, and versioning

- [ ] Red: chat message → patch conversion is a pure function with recorded fixtures; malformed output is rejected, never applied.
- [ ] Red: anchored comments round-trip through the project file.
- [ ] Green: diff view with per-hunk accept/reject.
- [ ] Green: version history with revert.
- [ ] Commit: `feat(ui): Add storyboard feedback and version history`

---

## Phase 8: Export and brand kit

- [ ] Red: brand-kit template validation rejects missing required elements.
- [ ] Green: title, outro, contact card, and lower-third layers.
- [ ] Green: music bed with ducking and a loudness target.
- [ ] Green: provenance manifest written with the export.
- [ ] Green: export runs through the job registry.
- [ ] Commit: `feat(export): Add brand-kit export with provenance`

---

## Phase 9: First-release verification

- [ ] Run `npm run check`.
- [ ] Manual verification: green-screen capture → cleanup → storyboard → fast preview → full preview → patch → export.
- [ ] Record measured render times from OD4 and revise the preview latency promise.
- [ ] Update `measure/tech-stack.md`, `measure/tech-debt.md`, `measure/lessons-learned.md`.
- [ ] Commit: `measure(plan): Mark storyboard compositor first release complete`

---

## Phase 10: Generated images (Stage 2)

- [ ] Define the asset provider interface inside `packages/ai`.
- [ ] Implement content-addressed image assets with provenance.
- [ ] Wire `generated-image` scenes through the existing renderer unchanged.
- [ ] Add cost display and approval before generation.
- [ ] Detailed task list when Phase 9 closes.

---

## Phase 11: Generated video (Stage 3)

- [ ] Implement queued, cancellable clip generation with placeholders.
- [ ] Wire `generated-video` scenes through the existing renderer unchanged.
- [ ] Define retain/prune policy for generated assets.
- [ ] Detailed task list when Phase 10 closes.
