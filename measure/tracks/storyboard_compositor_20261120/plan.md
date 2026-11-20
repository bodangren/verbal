# Plan: Storyboard Compositor

**Status:** BLOCKED — awaits `rewrite_ts_vinext_20261120` Phase 5 (cut-list export)
**Created:** 2026-11-20
**Focus:** Turn a cleaned green-screen talking head into a storyboard-driven explainer video.

> **⚠️ Stale stack references (2026-11-20).** Phases 1–8 below name Go packages and GStreamer elements from the retired implementation. The phase *intent* is still correct; the implementation details are not. Refresh each phase's tasks when the rewrite track unblocks this one. Do not implement as written.

> **Scope discipline.** Phases 0–8 are the first release (Remotion motion slides). Phase 10 (generated images) and Phase 11 (generated video) reuse the same IR and renderer and must not change the Phase 1–6 contracts. Phases 9–11 are sketched only; they get detailed task lists when the preceding phases close.

> **Prerequisite gate.** Phases 0–8 depend on `mvp_transcription_20260612` and `mvp_text_delete_20260612` being trustworthy (see the integrity flag in `measure/tracks.md`). Do not start Phase 1 until Phase 0 records that decision.

---

## Phase 0: Prerequisites, contracts, and documented deviation

No production code in this phase.

- [ ] Record the Remotion sidecar deviation in `measure/tech-stack.md` with a dated note (motion-graphics authoring is a capability GStreamer does not provide; final compositing stays in GStreamer; Remotion emits PNG frames, so Verbal never calls FFmpeg directly).
- [ ] Resolve OD2 (Remotion licensing) and OD3 (sidecar packaging) as decisions in this plan; both are release blockers, not implementation details.
- [ ] Decide the prerequisite gate: confirm whether `mvp_transcription_20260612` and `mvp_text_delete_20260612` are usable as-is, or whether the legacy implementations must be reconciled first.
- [ ] Write the scene-contract schema (JSON) as the single interface between `internal/storyboard`, the sidecar, and `internal/compose`. Store it in `internal/compose/contracts/` and treat it as frozen once Phase 2 begins.
- [ ] Define project-file additions: `storyboard.json`, `assets/`, `renders/`, and their retention policy.

**Exit criteria:** deviation documented, OD2/OD3 decided, prerequisite gate recorded, contract schema committed.

---

## Phase 1: Storyboard IR and anchor resolution

Pure Go, no GTK, no Node. Package: `internal/storyboard`.

### Red
- [ ] Failing tests: storyboard document parses and validates; unknown visual kind, duplicate scene ID, and missing required fields are rejected.
- [ ] Failing tests: anchor resolution maps a word span to a time range via a frozen anchor index; unresolved word IDs are an error, never a silent clamp.
- [ ] Failing tests: `talk` scenes ignore slide props; `slide` scenes require an asset or template.
- [ ] Failing tests: patch application supports add, remove, reorder, and asset-swap, and `Apply` followed by `Revert` restores the document byte-for-byte.
- [ ] Failing tests: scene content hash is stable across runs and independent of map iteration order; changing props, asset, or duration changes the hash.

**Targeted Red command:**
```bash
go test ./internal/storyboard -count=1
```

### Green
- [ ] Implement `storyboard.go` (document, scene, validation).
- [ ] Implement `anchors.go` (word-span → time range against the frozen index, with padding).
- [ ] Implement `patch.go` (apply, revert, diff).
- [ ] Implement `hash.go` (canonical JSON + content hash).
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(storyboard): Add storyboard IR, anchors, and patches`

### Adversarial Audit
- [ ] Audit the LLM boundary: prove that no code path accepts a timecode from a model response.
- [ ] Audit hash stability, patch invertibility, and concurrent read of a shared document.

---

## Phase 2: Slide render contract and cache

Package: `internal/compose`. No Node required for tests.

### Red
- [ ] Failing tests for the `SlideRenderer` interface using a fake: request marshalling matches the frozen schema, and output manifest is parsed into a typed result.
- [ ] Failing tests: cache hit returns the existing sequence without invoking the renderer; cache miss invokes it exactly once.
- [ ] Failing tests: two scenes differing only in duration have different cache keys; a scene with identical content reuses its key.
- [ ] Failing tests: a renderer error yields a placeholder result plus a non-nil error; the caller can continue.
- [ ] Failing tests: renderer cancellation and timeout are honoured.

**Targeted Red command:**
```bash
go test ./internal/compose -run 'TestSlide' -count=1
```

### Green
- [ ] Implement the scene-contract types and JSON marshalling.
- [ ] Implement the content-addressed on-disk cache.
- [ ] Implement the sidecar client as a subprocess with timeout and cancellation.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(compose): Add slide renderer contract and cache`

---

## Phase 3: Compositor pipeline builder

Headless-testable pure functions first; actual rendering is display/hardware gated.

### Red
- [ ] Failing tests for the pipeline builder: keyed speaker plus full-frame slide, speaker-inset, and side-by-side produce distinct, correct element chains.
- [ ] Failing tests: `alpha` keying element is present with the configured key colour; layer ordering is deterministic.
- [ ] Failing tests: music bed adds `audiomixer` and `sidechaincompress`; absent music omits them.
- [ ] Failing tests: all file paths are sanitised through the existing `internal/media` helpers.

**Targeted Red command:**
```bash
go test ./internal/compose -run 'TestBuildComposite|TestLayer' -count=1
```

### Green
- [ ] Implement `render.go` pipeline builder.
- [ ] Implement layer geometry for the three modes.
- [ ] Implement the audio bed and ducking chain.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(compose): Add GStreamer composite pipeline builder`

---

## Phase 4: Remotion template pack

Node subproject, isolated from the Go build. Author using the `remotion-best-practices` skill.

- [ ] Scaffold `tools/remotion/` with pinned dependencies and a lockfile.
- [ ] Implement `renderSlide` entry point: stdin/JSON in, PNG sequence plus manifest out, alpha preserved.
- [ ] Implement the initial template pack: title, section break, bullet reveal, quote, code walkthrough, lower third.
- [ ] Implement "natural length + hold tail" rendering so composite-time trims do not invalidate the cache.
- [ ] Golden tests: props → manifest (frame count, dimensions, alpha channel present, deterministic output hash).
- [ ] Document the template props schema in the spec's contract file.

**Exit criteria:** a hand-written storyboard renders end-to-end to a composited file on a developer machine.

---

## Phase 5: Two-tier preview

- [ ] Red: tests that fast preview never triggers a sidecar call.
- [ ] Red: tests that both tiers derive from the same IR version and are labelled consistently.
- [ ] Green: implement fast preview (cut list + static/cached layers).
- [ ] Green: implement full preview (complete composite to a temp file).
- [ ] Green: version previews monotonically and expose them in the project.
- [ ] Refactor + commit: `feat(ui): Add two-tier storyboard preview`

---

## Phase 6: Cleanup review UI

- [ ] Red: tests for proposal grouping, per-category acceptance, and aggressiveness application.
- [ ] Green: cleanup proposal list with strikethrough words, gap markers, and audio-fix badges.
- [ ] Green: visual-cover suggestion per deletion.
- [ ] Green: freeze-master action producing master + anchor index; re-anchoring prompt when the master changes.
- [ ] Refactor + commit: `feat(ui): Add cleanup review and master freeze`

---

## Phase 7: Feedback, patches, and versioning

- [ ] Red: chat message → patch conversion is a pure function with a recorded fixture; malformed output is rejected, never applied.
- [ ] Red: anchored comment round-trips through the project file.
- [ ] Green: diff view with per-hunk accept/reject.
- [ ] Green: version history with revert.
- [ ] Refactor + commit: `feat(ui): Add storyboard feedback and version history`

---

## Phase 8: Export and brand kit

- [ ] Red: brand-kit template validation rejects missing required elements.
- [ ] Green: title, outro, contact card, and lower-third layers.
- [ ] Green: music bed with ducking and loudness target.
- [ ] Green: provenance manifest written alongside the export.
- [ ] Green: export preset integration.
- [ ] Refactor + commit: `feat(export): Add brand-kit export with provenance`

---

## Phase 9: First-release verification

- [ ] Run `make check`.
- [ ] Manual verification: green-screen recording → cleanup → storyboard → fast preview → full preview → feedback patch → export.
- [ ] Record the measured render times from OD4 and revise the preview latency promise if needed.
- [ ] Update `measure/tech-stack.md`, `measure/tech-debt.md`, `measure/lessons-learned.md`.
- [ ] Update this `plan.md` and `measure/tracks.md`.
- [ ] Commit: `measure(plan): Mark storyboard compositor first release complete`

---

## Phase 10: Generated images (Stage 2)

- [ ] Define the asset provider interface behind `internal/ai` (no vendor SDK outside that module).
- [ ] Implement content-addressed image assets with provenance.
- [ ] Wire `generated-image` scenes through the existing renderer unchanged.
- [ ] Add cost display and approval before generation.
- [ ] Detailed task list to be written when Phase 9 closes.

---

## Phase 11: Generated video (Stage 3)

- [ ] Implement queued, cancellable clip generation with placeholders.
- [ ] Wire `generated-video` scenes through the existing renderer unchanged.
- [ ] Define retain/prune policy for generated assets.
- [ ] Detailed task list to be written when Phase 10 closes.
