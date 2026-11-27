# Specification: Save and Export Integrity

## Problem

Save completion can mark an unsaved revision as clean.
Export writes directly to the final path and shares temporary files across jobs.
Failure can remove a previous output.
See [F04–F05 and the export portion of F15](../../review-2026-11-22.md).

## Goals

1. Acknowledge only the project revision that reached disk.
2. Protect pending edits when the user changes projects.
3. Isolate concurrent exports and preserve prior files.
4. Reuse safe export work after correctness is established.

## Non-Goals

- Multi-user collaboration, cloud backup, or a general revision database.
- Automatic overwrite of source media or project documents.
- Approximate cuts or keyframe snapping.
- A general stream-copy implementation for arbitrary edited ranges.

## Functional Requirements

### FR1: Save identity

- Each save captures project identity, document revision, and serialized content.
- Completion acknowledges that captured revision only.
- Edits made during a save remain dirty until their own save succeeds.
- A response from another project cannot change the current document's saved state.
- Explicit and automatic saves share one coordinator.
- Keep one in-flight save per project, with one latest queued revision.
- Save errors remain visible and retryable.
- Do not swallow a failure and then report success.
- Before project navigation, flush pending edits or require explicit discard.
- Warn on page close while unsaved work remains.

### FR2: Isolated export

- Allocate one work directory per export job.
- Use unique segment paths and a private concat list.
- Write the final media to a temporary sibling of its destination.
- Reject a destination that aliases source media, project documents, or required assets.
- Check symlink and hard-link aliases.
- Existing output needs explicit replacement consent.
- Probe output before publication.
- Publish only a fully verified file.
- Keep provenance consistent with the published output.
- Preserve the previous output on cancellation, failure, or verification error.
- Remove temporary work after a settled job.

### FR3: Safe reuse

- Measure baseline first and repeat timings on the same fixture.
- Reuse normalized encoded segments only when all input hashes and output parameters match.
- Include source revision, compiled edit pieces, geometry, codecs, audio settings, and template version in cache identity.
- Permit no-edit stream copy only when the complete source and destination contract matches.
- Keep the exact encode path for every unsupported case.
- Report whether export reused or encoded work.
- Do not weaken output verification for a cache hit.

## Acceptance Criteria

- A delayed save followed by another edit leaves the newer edit dirty.
- A delayed save for project A cannot mark project B clean.
- Failed explicit and automatic saves expose the same retry state.
- Navigation flushes pending work or waits for explicit discard.
- Two concurrent exports cannot share or overwrite segments.
- Source, symlink, and hard-link destination aliases fail before FFmpeg writes.
- A failed export preserves sentinel bytes in an existing destination.
- A cancelled export leaves no temporary final media.
- A successful export publishes verified media and matching provenance.
- A second identical export skips segment encoding.
- Changing one scene invalidates only its dependent encoded segments.
- A codec mismatch or an edited source uses the exact encode fallback.
- `npm run check` and offline browser and media gates pass.

## Dependencies

- `local_safety_20261122`.
- `edit_timeline_integrity_20261122`.

## Risks

- Browser close cannot guarantee completion of a pending network write.
- Cross-filesystem publication must not use a non-atomic rename fallback.
- Cache keys that omit an audio or template setting can reuse incorrect output.
- Replacement consent must bind to the observed destination revision.
