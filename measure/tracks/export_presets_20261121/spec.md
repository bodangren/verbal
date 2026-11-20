# Specification: Export Presets

## Overview

Exporting takes an output path and silently uses one hard-coded codec bundle (H.264 CRF 20, AAC 192k). A creator who wants a small web file, a podcast audio file, or a high-quality archive has no way to ask for one. This track names those bundles as presets and threads the choice through to FFmpeg.

## Goals

1. Named presets that resolve to exported codec options and a container.
2. The export endpoint accepts a preset and applies it.
3. The page offers a preset selector with a sensible default.

## Non-Goals

- Per-preset resolution, frame-rate, or bitrate sliders; presets are discrete bundles.
- Stream-copy export (needs keyframe probing) — the open tech-debt item.
- Saving custom presets or remembering the last used one.
- Audio-only extraction as a separate command: the podcast preset keeps producing the container FFmpeg writes.

## Functional Requirements

### FR1: Presets
- `EXPORT_PRESETS` lists at least: *Web (H.264)*, *WebM (VP9)*, *Archive (H.264, high quality)*, *Podcast (audio)*.
- Each preset has an `id`, `label`, `extension`, and `codecs` matching `ExportCodecOptions`.
- `resolvePreset(id)` returns the matching preset; an unknown, empty, or missing id returns the default preset (Web H.264).
- Ids are stable strings, never indexes, so a stored choice survives reordering the list.

### FR2: Output naming
- `withPresetExtension(outputPath, preset)` appends the preset's extension when the path lacks it, and leaves a path that already ends with it alone.
- Matching the extension is case-insensitive.

### FR3: Endpoint
- `POST /api/export` accepts an optional `preset` string and passes the resolved codecs to FFmpeg.
- The response echoes the preset id used, so the caller can tell what happened.

### FR4: Page
- The Export panel has a preset selector listing the presets, defaulting to the web preset.
- The chosen preset is sent with the export request.

## Acceptance Criteria

- [ ] Unit tests cover resolution (known, unknown, missing), extension handling, and that every preset has the codecs FFmpeg needs.
- [ ] A route test proves the chosen preset reaches FFmpeg's argv.
- [ ] `npm run check` passes; the walkthrough still passes and shows the selector.

## Dependencies

- `buildExportArgs`/`runExport` with codec overrides (complete).
- `POST /api/export` (complete).

## Risks

- A preset whose codec the local FFmpeg lacks fails at runtime; the preset list sticks to codecs the repository's own export tests already exercise (libx264/AAC) plus VP9/Opus for WebM, and the error surfaces from the job.
