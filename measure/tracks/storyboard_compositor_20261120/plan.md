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
- [x] Failing tests: keyed speaker plus full-frame slide, speaker-inset, and side-by-side produce distinct, correct filtergraphs.
- [x] Failing tests: `chromakey`/`despill` appear with the configured key colour; layer ordering is deterministic.
- [x] Failing tests: a music bed adds `amix` and `sidechaincompress`; no music omits them.
- [x] Failing tests: paths never enter the filtergraph; only timestamps and labels do.

**Targeted Red command:**
```bash
npx vitest run packages/compose
```

**Red result:** `composite.test.ts` failed on a missing module; the 19 existing compose tests stayed green.

### Green
- [x] Implement the filtergraph builder as a pure function returning argv.
- [x] Implement layer geometry for the three modes.
- [x] Implement the audio bed and ducking chain.
- [x] Make tests pass.

**Green result:** 30/30 in `packages/compose`; full suite 234/234; `npm run check` exits 0.
- `buildCompositeArgs` takes inputs in a fixed order — slide (0), speaker (1), music (2) — so the filtergraph indices are stable.
- `full-frame` scales and pads the slide and ignores the speaker video; `speaker-inset` runs `chromakey` + `despill` and overlays the keyed speaker in the bottom-right; `side-by-side` stacks the slide with the keyed speaker over a black half-frame.
- Audio: without music, the programme audio goes through `loudnorm`; with music, the programme is split into voice and sidechain, the music is `volume`-scaled, `sidechaincompress` ducks it, and `amix` joins them before `loudnorm`.
- Paths appear only as argv elements; the filtergraph contains labels, timestamps, and numbers. A hostile path cannot alter the graph.
- Identical requests produce identical argv.

### Refactor
- [x] Commit: `feat(compose): Add composite filtergraph builder` — `fab5ffe`

---

## Phase 4: Remotion template pack

Node subproject in `tools/remotion`, isolated from the app build.

- [x] Scaffold with pinned dependencies and a lockfile (`--save-exact`).
- [x] Implement `renderSlide`: JSON in, PNG sequence plus manifest out, alpha preserved.
- [x] Implement the initial templates: title, section break, bullet reveal, quote, code walkthrough, lower third.
- [ ] Natural length + hold tail: **deferred.** Rendering uses the exact scene duration, so an anchor change re-renders that scene (duration is in the content hash). Logged in `tech-debt.md`; revisit when preview latency matters.
- [x] Golden checks: manifest assertions (frame count, dimensions, alpha) plus an opt-in end-to-end test that renders frames and composites them.
- [x] Document the props schema alongside the frozen contract (`tools/remotion/README.md`).

**Exit criteria:** met — `VERBAL_REMOTION_TEST=1 npx vitest run packages/compose/src/remotion.integration.test.ts` renders 10 alpha PNGs via Remotion, composites them over a keyed speaker with FFmpeg, and confirms the result with ffprobe in about 3.4 s.

**Result details:**
- Remotion and its renderer/bundler are pinned in `tools/remotion/package-lock.json`; 242 packages installed.
- The renderer drives `/usr/bin/google-chrome` (no Chromium download) and caches its webpack bundle, invalidated by a hash of `src/`.
- Six templates: `title`, `section`, `bullets`, `quote`, `code`, `lower-third`. All except `code` keep the background transparent.
- `packages/compose` now has `nodeProcessRunner`, the production stdin/stdout process runner, covered by a real-subprocess test.
- `npm run smoke` renders 1 s at 320x180 and reports `{"frames":10,"hasAlpha":true}`.

### Refactor
- [x] Commit: `feat(remotion): Add slide template pack and PNG renderer` — `868336f`

---

## Phase 5: Two-tier preview

- [x] Red: fast preview never starts the renderer.
- [x] Red: both tiers derive from the same IR version and are labelled consistently.
- [x] Green: fast preview planning (cached frames, static assets, placeholders) — no render calls.
- [ ] Green: full preview to a file — **moved to Phase 8.** Phase 5 executes the renders; assembling scenes into one file is the same multi-scene concat the export needs, so it is built once there instead of twice.
- [x] Green: monotonic preview versions exposed by the project.
- [x] Commit: `feat(ui): Add two-tier storyboard preview` — `0d92664`

**Targeted Red command:**
```bash
npx vitest run packages/compose/src/preview.test.ts apps/web/components/storyboard-preview.test.tsx
```

**Red result:** `preview.test.ts` and `storyboard-preview.test.tsx` failed on missing modules.

**Green result:** 14 preview tests + 4 component tests; full suite 255/255; `npm run check` exits 0.
- `planPreview` is pure planning: it resolves anchors, hashes slide requests, and labels each scene `talk`, `asset`, `cached`, `placeholder`, or `render`. The fast tier can only produce `cached`/`placeholder`, so a fast preview has no path to Chromium.
- Both tiers carry the same `storyboardHash` and scene order, so they are provably derived from the same IR.
- `executePreviewPlan` renders only `render` entries, reuses the cache afterwards, and turns renderer failures into placeholders.
- `createPreviewVersionTracker` yields monotonic versions; the panel displays the version and the tier.
- `StoryboardPreview` exposes scene sources as `data-source` and marks the active tier with `aria-pressed`.

---

## Phase 6: Cleanup review UI

- [x] Red: proposal grouping, per-category acceptance, and aggressiveness application.
- [x] Green: proposal list with strikethrough words, category markers, and audio-fix badges.
- [x] Green: visual-cover suggestion per deletion.
- [x] Green: freeze-master action producing the authoritative cut list, the master-time anchor index, and a fingerprint for re-anchoring.
- [x] Commit: `feat(ui): Add cleanup review and master freeze` — `4d1a05d`

**Targeted Red command:**
```bash
npx vitest run packages/cleanup apps/web/components/cleanup-review.test.tsx
```

**Red result:** 4 files failed on missing modules.

**Green result:** 19 package tests + 5 component tests; full suite 279/279; `npm run check` exits 0.
- `packages/cleanup` splits browser-safe logic (types, grouping, acceptance) from server-side freezing behind the `@verbal/cleanup/freeze` subpath. The review component imports only the root, so `node:crypto` and the media cut-list code never reach the client bundle.
- `groupProposals` uses a canonical category order; empty categories disappear.
- `resolveAccepted` requires a proposal to be enabled by category or id **and** to clear `1 - aggressiveness`; the default acceptance removes nothing.
- `freezeMaster` marks accepted words, derives the cut list, and maps surviving words into **master** time. It returns a fingerprint of the exact cut; `requiresReanchor` compares a storyboard's recorded fingerprint against the current one.
- Media rendering stays with the existing export path: the frozen cut list is what export consumes, so there is one cut-list implementation.
- `CleanupReview` shows audio-fix badges, an aggressiveness slider, per-category and per-proposal checkboxes, struck-through word spans, confidence, and the suggested cover. Nothing is removed until it is enabled and frozen.
- Gap markers are represented by the `dead-air` category and its reason rather than a separate inline marker; revisit if the transcript view needs an inline affordance.

---

## Phase 7: Feedback, patches, and versioning

- [x] Red: chat message → patch conversion is a pure function with fixtures; malformed output is rejected, never applied.
- [x] Red: anchored comments round-trip through the project file.
- [x] Green: diff view with per-hunk accept/reject.
- [x] Green: version history with revert.
- [x] Commit: `feat(ui): Add storyboard feedback and version history` — `6dd4b2d`

**Targeted Red command:**
```bash
npx vitest run packages/storyboard apps/web/components/patch-review.test.tsx
```

**Red result:** 4 files failed on missing modules.

**Green result:** 55 storyboard tests + 6 component tests; full suite 311/311; `npm run check` exits 0.
- `parsePatchResponse` accepts only the patch vocabulary (`add`, `remove`, `move`, `replace-asset`, `update-props`). Invalid JSON, a missing `patches` array, an unknown type, an `add` without a valid scene, and a non-integer index are all rejected before anything is applied.
- `applyAcceptedPatches` applies a user-chosen subset, so per-hunk accept/reject is a data operation rather than UI state.
- `describePatch` gives each hunk a stable one-line label for the review surface.
- `parseComments`/`serializeComments` round-trip anchored comments (`time`, `scene`, `word`) with duplicate-id, unknown-kind, negative-time, and empty-text validation.
- `createStoryboardHistory` is append-only: reverting to version 1 appends a new version carrying the old document, so every decision stays auditable and a revert can itself be reverted.
- The storyboard package now exposes a browser-safe root and puts `node:crypto` hashing behind `@verbal/storyboard/hash`; compose and cleanup imports were updated accordingly.
- `PatchReview` lists each hunk with a checkbox, a live selection count, and Apply/Discard actions.

---

## Phase 8: Export and brand kit

- [x] Red: brand-kit validation rejects missing required elements and out-of-range audio settings.
- [x] Green: assemble scenes into one file — the multi-scene concat deferred from Phase 5 — through one path usable by full preview and export.
- [x] Green: title, outro, and contact card travel in the assembly plan; the lower third is a brand field rendered by the per-scene composite.
- [x] Green: music bed with ducking and a loudness target (`audioFromBrand` maps the kit onto the composite audio chain).
- [x] Green: provenance manifest with per-scene hashes and a brand-kit hash.
- [x] Green: export runs through the job registry (`runStoryboardExport` reuses `runExportJob`).
- [x] Commit: `feat(export): Add brand-kit export with provenance` — `aba4c75`

**Targeted Red command:**
```bash
npx vitest run packages/compose/src/brand.test.ts packages/compose/src/assemble.test.ts packages/compose/src/provenance.test.ts apps/web/server/storyboard-export.test.ts
```

**Red result:** 4 files failed on missing modules.

**Green result:** 30 phase tests; full suite 341/341; `npm run check` exits 0.
- `validateBrandKit` requires title, outro, contact, and lower-third content, a loudness target in −40..0 LUFS, and a music volume in 0..1.
- `planAssembly` emits title → scenes → outro, carrying brand text; the contact card (`name · handle · url`) rides on the outro subtitle. Brand text travels with the steps so a renderer never re-reads the kit.
- `buildConcatListContent` escapes single quotes per the concat demuxer's parser; `buildConcatArgs` stream-copies. Verified against real FFmpeg: two 1-second clips assemble to a ~2-second file with video and audio.
- `assembleStoryboard` renders steps in order and concatenates only after every step succeeds, so a failure never yields a partial sequence that looks finished.
- `buildProvenanceManifest` pins the brand kit and each scene by hash; `runStoryboardExport` writes it only after assembly succeeds.
- **Remaining wiring (Phase 9):** `renderStep` is dependency-injected. The concrete adapter that renders brand/scene slides through Remotion and composites each scene with FFmpeg is not constructed yet, so nothing has run the full storyboard → file path end to end.

---

## Phase 9: First-release verification

- [x] Run `npm run check` — 346 passed, 2 opt-in skips.
- [x] Automated end-to-end verification: `VERBAL_REMOTION_TEST=1 npx vitest run packages/compose/src/render-step.integration.test.ts` renders a title, a scene, and an outro through Remotion, composites each with a keyed speaker, and concatenates them into one 3-second file with video and audio.
- [ ] Manual browser walkthrough: **not performed.** The capture, cleanup, patch, and preview panels are mounted only in tests; there is no composed page yet. Recorded as the next unit of work.
- [x] Render timing recorded: about 10.6 s for three 1-second steps at 320×180, dominated by bundle and browser startup. Not representative of 1080p; do not promise preview latency from it.
- [x] Updated `tech-stack.md`, `tech-debt.md`, and `lessons-learned.md`.
- [x] Commit: `measure(plan): Mark storyboard first release complete`

**First-release result:** the pipeline is complete and verified end to end. What remains for an application is composition: one page that wires project → import → transcript → storyboard → preview → export.

---

## Phase 9b: Application composition

- [x] Storyboard documents load and save through `storyboard.json`; an absent file reads as an empty storyboard.
- [x] `POST /api/storyboard/preview` plans fast and full tiers from the saved transcript and storyboard.
- [x] `POST /api/storyboard/export` runs the concrete adapter (Remotion per step, FFmpeg composite, concat) as a job and writes provenance.
- [x] `GET/PUT /api/transcript` loads and saves the transcript document.
- [x] The composed page wires project create/open, media import, transcript display, storyboard save, preview tiers, patch parsing/apply, and export with job polling.
- [x] Live HTTP verification: project → transcript → storyboard → import → fast preview → export produced a 7.0 s file (3 s title + 1 s scene + 3 s outro) with a provenance manifest.
- [x] Commit: `feat(ui): Compose the storyboard application` — `81cc570`

**Not done:** a browser interaction walkthrough (the flow was verified over HTTP against the real server), and green-screen capture.

---

## Phase 9c: Green-screen capture (FR1)

- [x] `buildCaptureArgs` builds V4L2 + PulseAudio argv; the source is written **un-keyed** so a take can be re-keyed later.
- [x] The capture job runs through the job registry, reports progress, and removes a partial file on failure or cancellation.
- [x] `POST /api/capture` records into `assets/capture-*.mp4` and records it as project media only on success.
- [x] "Stop recording" aborts the process through a capture abort registry, wired into `DELETE /api/jobs/[id]`.
- [x] `assessKeyQuality` judges the background from sampled pixels (green dominance + uniformity); the page samples the camera canvas once a second.
- [x] `CapturePanel` shows the controls and a key-quality warning (`good` / `warning` / `poor`).
- [x] Live failure-path verification: no camera → job failed with an FFmpeg error, **no partial file**, project media unchanged, page renders the capture section.
- [ ] Live success-path verification: **not possible here** — this machine has no V4L2 camera. The argv is unit-tested and the failure path is live-tested.

---

## Phase 10: Generated images (Stage 2)

- [x] Define the image asset provider interface inside `packages/ai` (`ImageProvider` with a local `estimateCost`).
- [x] Implement content-addressed image assets with provenance (`sha256` ids, sidecar metadata).
- [x] Wire `generated-image` scenes through the existing step adapter: an asset-backed scene composites the stored image and never starts the renderer.
- [x] Add cost display and approval before generation: a dry run returns the price and touches nothing; the page keeps **Generate** disabled until an estimate exists.
- [x] Commit: `feat(images): Add generated image assets with cost-gated generation` — `eb2b815`

**Targeted Red command:**
```bash
npx vitest run packages/ai/src/images.test.ts packages/compose/src/assets.test.ts packages/compose/src/render-step.test.ts apps/web/server/image-api.test.ts apps/web/server/storyboard-api.test.ts
```

**Red result:** 10 assertions failed across 5 files on missing modules and unsupported asset paths.

**Green result:** 35 phase tests; full suite 403/403; `npm run check` exits 0.
- `createOpenAiImageProvider` posts to `/images/generations`, decodes `b64_json`, and rejects empty prompts before any network call. `estimateCost` is local and defaults to $0.04.
- `createFileAssetStore` addresses assets by the SHA-256 of their bytes; writing the same image twice is a no-op, and metadata (prompt, model, source, timestamp) travels beside the blob.
- `createStepRenderer` composites an `assetPath` scene directly with `-loop 1`, skipping Remotion entirely.
- `POST /api/storyboard/generate-image` with `dryRun` returns the price; otherwise it generates, stores the asset, and writes the new `assetId` into `storyboard.json`.
- `startStoryboardExport` now includes `generated-image` scenes from `assets/generated/<assetId>`.
- A `generated-image` scene is valid before it has an asset; only `static` requires one.
- **Live verification:** a fake OpenAI-compatible server → estimate 0.04 → generate (asset on disk, scene updated) → import → export produced a 7.0 s file.

---

## Phase 11: Generated video (Stage 3)

- [ ] Implement queued, cancellable clip generation with placeholders.
- [ ] Wire `generated-video` scenes through the existing renderer unchanged.
- [ ] Define retain/prune policy for generated assets.
- [ ] Detailed task list when Phase 10 closes.
