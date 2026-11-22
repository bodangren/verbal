# Specification: Repository Contracts and Verification

## Problem

The normal gate does not prove the complete renderer and export path.
Root installation omits the renderer tool.
Current documentation still describes retired frameworks and conflicting track states.
Tracked demonstration media and GitHub language classification also need reconciliation.
See [F14 and F16–F19](../../review-2026-11-22.md).

## Goals

1. Make a clean clone sufficient for a deterministic offline media gate.
2. Test exported behavior rather than only calls and job status.
3. Enforce architectural boundaries automatically.
4. Reconcile current context without deleting historical evidence.
5. Give tracked media a documented purpose and location.

## Non-Goals

- Paid API calls, model downloads, hardware purchases, or distribution.
- Changing the centrally managed automation supervisor.
- Rewriting Git history or adding LFS without approval.
- Declaring unavailable hardware or real-provider checks passed.
- Restoring Go, GTK, GStreamer, Rust, or Tauri code.

## Functional Requirements

### FR1: Reproducible setup and gates

- Document Node 24, FFmpeg, ffprobe, and system Chrome prerequisites.
- Provide one deterministic bootstrap for the root and renderer lockfiles.
- Keep Remotion versions pinned.
- Typecheck tool TypeScript and verify tool scripts.
- Add a required offline media gate with real FFmpeg and Remotion.
- Require media prerequisites for that gate instead of silently skipping them.
- Fail unexpected fixture creation or import errors.
- Keep provider traffic confined to fake local servers.
- Record test counts, skips, timings, and output measurements.
- Define a focused formatting policy before changing formatting configuration.
- Avoid unrelated source formatting in a documentation cleanup.
- Normalize the 98 existing formatting failures in a separate style commit.
- Trace the vulnerable `fflate` dependency and select a compatible patch or evidenced mitigation.
- Do not apply the audit's proposed vinext downgrade automatically.

### FR2: Behavior and boundary tests

- Exercise import, fake transcription, deletion, reorder, silence, preview, and final export.
- Measure content order, offsets, audio channels, duration, and silent brand bookends.
- Verify cancellation and failed publication preserve previous output.
- Add automated guards for shell-free subprocesses and provider abstraction.
- Prevent browser entry points from importing Node built-ins transitively.
- Check changed modules' coverage against the workflow target.
- Keep pure builder tests and injected failure tests.
- A fake implementation must not replace the only test of production wiring.

### FR3: Supported local ASR

- Name one supported whisper CLI and record its version and required flags.
- Test captured output from that CLI, including segment and token output differences.
- Reject segment-level output when word-level output is required.
- Convert supported media to the CLI's required local input format through existing media adapters.
- Keep CLI scratch output inside job-owned work, not beside an external source.
- Use fixture tests without downloading a model.
- If a local binary and model exist, run an optional real local smoke test.
- Otherwise retain the unverified status and the existing debt entry.

### FR4: Context and track reconciliation

- Address every current-document row in the review inventory.
- Keep `AGENTS.md` mandates and the directive's standing rules.
- Correct product and guidelines for the current local browser application.
- Separate current implementation, optional design, and historical decisions.
- Reconcile registry, plan, spec acceptance, and metadata using actual evidence.
- Mark superseded shell work as superseded.
- Classify compositor audits and environment checks separately from implemented phases.
- Preserve the scripted-ASR limitation in dogfood records.
- Keep lessons and current debt within their documented 50-line limits.
- Archive old detail with links; do not erase evidence.
- Do not force a blocked environment check into a completed status.

### FR5: Repository assets

- Inventory every tracked MP4, PNG, and JPG and its code references.
- Move demonstration media only after identifying required renderer references.
- Keep source assets and delivered examples in documented directories.
- Provide reproduction commands for generated examples.
- Ignore future temporary renders and session artifacts.
- Add accurate binary or generated-file Linguist attributes.
- Keep TypeScript source classified as source.
- Verify GitHub classification after the default branch receives the change.
- Record remote reclassification as pending until GitHub updates it.

## Acceptance Criteria

- A documented clean-clone bootstrap prepares the application and renderer.
- The required offline gate performs a real edited export and validates its media content.
- A broken fixture import makes the browser gate fail, not skip playback.
- Architecture guards fail representative prohibited imports and shell invocations.
- Tool TypeScript participates in verification.
- The formatting gate passes without excluding source files to suppress failures.
- The dependency audit has no unreviewed findings; any mitigation includes reachability evidence.
- Captured local-ASR fixtures prove the supported word-level contract.
- Every stale-document inventory row has a recorded disposition.
- Registry, plan, and metadata agree or name an explicit environment limitation.
- Current lessons and debt each contain no more than 50 lines.
- Root media references remain valid after any approved move.
- `npm run format:check`, `npm run check`, and `npm run e2e` have recorded results.
- No test calls a paid provider.

## Dependencies

Final acceptance follows all five earlier improvement tracks.
Documentation inventory and gate design can start earlier without changing their contracts.

## Risks

- Repository-wide formatting can obscure meaningful changes.
- A real local ASR check may remain unavailable.
- GitHub language results update asynchronously after merge.
- Archiving current context can break links unless link checks cover it.
