# Current Directive

Primary direction (Daniel, 2026-11-22): UI/UX. Security and integrity tracks follow.

The primary plan is [the UX review and improvement plan](./review-ux-2026-11-22.md).
Daniel's target screens are in `tracks/review_planning_20261122/screens/target-*.jpg`.
`DESIGN.md` tokens still rule over the target screens.

## Merged execution order

A security or integrity track goes ahead of a UX track only when that UX track cannot be built safely without it.

1. **UX Gates and Design Conformance** — `ux_gates_20261122`.
2. **Shell and Core Flow** — `ux_shell_flow_20261122`.
3. **Transcript as a Document** — `ux_transcript_document_20261122`.
4. **Edit Inspector and Cleanup Review** — `ux_edit_inspector_20261122`.
5. **Webcam Recording with Teleprompter** — `teleprompter_capture_20261123`.
   Upload validation is built into the track; it does not wait for Local Safety Boundaries.
6. **Local Safety Boundaries** — `local_safety_20261122`.
   Reason: Edit Timeline Integrity depends on its path and filtergraph adapters.
7. **Edit Timeline Integrity** — `edit_timeline_integrity_20261122`.
   Reason: the UX timeline must show the same cuts that playback and export use (F01, F02).
8. **Edited Timeline and Playback** — `ux_timeline_playback_20261122`.
9. **Save and Export Integrity** — `save_export_integrity_20261122`.
   Reason: the export panel's Replace step needs isolated output that never overwrites inputs (F05).
10. **Job Lifecycle and Events** — `job_lifecycle_20261122`.
   Reason: the export panel's Cancel and progress need real cancellation and job events (F06, F10).
11. **Deliver Strip and Export Panel** — `ux_deliver_export_20261122`.
12. **Deliver Preview and Scene Controls** — `deliver_preview_20261122`.
    It fills the player slot and the scene field editor that the Deliver UX track leaves open.
13. **Repository Contracts and Verification** — `repository_contracts_20261122`.

## Secondary block: security and integrity (from the first review)

The repository review finds gaps in export fidelity, save acknowledgment, cancellation, and local safety.
See [the review and improvement plan](./review-2026-11-22.md) for evidence and gate results.
The list below keeps its original order inside the secondary block.

### Original security and integrity order

1. **Local Safety Boundaries** — `local_safety_20261122`.
   Enforce loopback access, validate paths and filtergraphs, and isolate renderer credentials.
2. **Edit Timeline Integrity** — `edit_timeline_integrity_20261122`.
   Preserve transcript edits, source offsets, scene layers, and compatible media streams.
3. **Save and Export Integrity** — `save_export_integrity_20261122`.
   Preserve revisions and previous files during saves, concurrent exports, and failures.
4. **Job Lifecycle and Events** — `job_lifecycle_20261122`.
   Cancel actual work, serialize registry writes, and replace page polling.
5. **Deliver Preview and Scene Controls** — `deliver_preview_20261122`.
   Play a composed preview and expose existing scene fields without raw JSON.
6. **Repository Contracts and Verification** — `repository_contracts_20261122`.
   Verify the real offline journey and reconcile setup, context, track states, and assets.

All twelve tracks start pending.
Follow their dependency lists before implementation.
Documentation inventory and gate design can start early.
Performance changes follow output-correctness measurements.
Keep exact encoding as the fallback.

## Existing tracks

- The UI rebuild supersedes unfinished shell design.
  Reconcile its metadata and the remaining shell dogfood task in the repository-contract track.
- The dogfood findings record fixed first-run friction.
  Preserve the scripted-transcript limitation and transfer only uncovered work.
- The compositor plan still mixes pending audits, deferred preview, resolved pruning, and unavailable hardware checks.
  Classify those items before closeout.
- Explicit asset pruning already exists.
  Do not reopen resolved pruning work.

## Environment gates

- Capture success on real V4L2 hardware remains unverified on this machine.
- Real paid provider checks need Daniel's separate approval.
  Tests use local fakes.
- Real local ASR remains unverified until a supported binary and model exist.
  Do not download a model or claim real ASR passed.

## Planning handoff

The UX review branch `plan/ux-review-2026-11-22` contains review and planning documents only.
PM checks the evidence before merging and pushing.
No code fix, deploy, or paid operation forms part of this planning assignment.

## Standing rules

- **Personal use.** No distribution, no telemetry, accounts, or cloud sync.
- **Client-first.** Pages Router, client components, route handlers. No RSC.
- **Pure builders.** Filtergraphs, anchors, patches, hashing, capture argv, key-quality, and cost estimates are pure functions with unit tests; subprocess and filesystem access are injected.
- **No vendor SDKs outside `packages/ai`.**
- **Browser-safe package roots.** Anything a React component imports must not pull Node built-ins; such code lives behind subpaths.
- **Price before you generate.** Estimates are local and shown before any paid call.
- **Prefer the parsed body.** vinext populates `req.body`.
- **Measure.** Update `measure/tracks.md` and the active `plan.md` before and after work.
