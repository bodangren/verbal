# Specification: Deliver Preview and Scene Controls

## Problem

Deliver reports a preview plan without rendering or playing a composed preview.
Full preview can show a rendering label without doing work.
Raw JSON remains the only detailed scene editor.
Slide caches invalidate on duration changes but can survive template changes incorrectly.
See [F13 and the slide portion of F15](../../review-2026-11-22.md).

## Goals

1. Let Daniel inspect the actual edited composition before export.
2. Distinguish planning, rendering, ready, and failed preview states.
3. Edit existing scene fields without writing JSON.
4. Reuse frames safely when anchor timing changes.

## Non-Goals

- A general timeline editor, transitions, new templates, or paid asset generation.
- Redesigning the application shell or changing `DESIGN.md`.
- A preview pipeline that differs from final export semantics.
- Hardware capture validation.

## Functional Requirements

### FR1: Honest preview states

- Fast preview never starts Remotion or a paid provider.
- Fast preview can reuse existing local material and must label missing material as a placeholder.
- Full preview runs the existing renderer and assembler as a job.
- A ready preview exposes a playable local media URL.
- Reuse the timeline and scene compiler from the integrity track.
- Keep output-time playback aligned with the transcript.
- Progress and cancellation use job events.
- A result from an older revision cannot replace a newer preview.
- Preserve the last ready preview during replacement and identify it as stale.
- A failed render explains the failed step and offers a retry.

### FR2: Existing scene inspector

- Select a scene from the scene list.
- Show its anchor words, visual kind, layer, and supported template properties.
- Validate edits through the shared storyboard schema.
- Show validation errors beside their fields.
- Keep raw JSON as an advanced view, not the required editing path.
- Save through the existing document boundary.
- Missing assets stay explicit.
- Do not offer an export action that can only fail for an empty storyboard.

### FR3: Cache correctness and timing reuse

- Include template source version and composition contract version in frame identity.
- Coordinate frame identity with encoded segment identity.
- Separate natural animation duration from a later hold tail.
- Reuse existing animation frames when the scene only extends its hold tail.
- Shorter scenes trim at composite time without retiming the animation.
- Property, geometry, frame-rate, or template-source changes invalidate dependent frames.
- Cache publication is atomic and single-flight per key.
- A cancelled or partial render never becomes a cache hit.

## Acceptance Criteria

- Fast preview invokes no renderer and shows explicit missing-material labels.
- Full preview returns a job, completes, and plays a local composed file in the browser.
- Output measurements match final export content order and audio.
- Cancel and retry produce correct job events and no partial ready preview.
- Changing projects or preview revisions cannot display an old job result as current.
- A scene can change its existing layer and title property without JSON editing.
- Invalid scene changes do not overwrite the last valid storyboard.
- Extending a hold tail reuses frames and changes output duration correctly.
- Changing template source invalidates both frame and segment caches.
- Two requests for one frame key perform one render.
- Browser checks pass at 1440×900 and 1280×800 with no clipped transport controls.
- `npm run check` and offline browser and media gates pass.

## Dependencies

- `export_fidelity_20261127`.
- `export_safety_20261127`.
- `job_integrity_20261127`.

## Risks

- Preview and export can drift if they construct separate scene plans.
- A hold tail can freeze animation at the wrong frame.
- A retained stale preview needs a clear label.
- More preview files require bounded temporary-file cleanup.
