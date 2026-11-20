# Specification: Timeline Waveform

## Overview

Playback has a video and a synced transcript but no timeline: nothing shows where the audio is loud, so seeking means guessing at numbers or hunting for a word. `ffmpeg`'s `showwavespic` draws exactly this from the source media, which the roadmap already noted as the cheap path.

## Goals

1. A pure argv builder for the waveform image, alongside the exporter's other argv builders.
2. A cached endpoint that serves a project's waveform.
3. A waveform beside the playback video that seeks where it is clicked.

## Non-Goals

- Per-word or per-cut overlays on the waveform (a later refinement).
- Client-side decoding: the browser never reads the audio samples.
- Waveforms for the cleaned master: the source media is what playback plays.
- Zoom and scroll: one image at a fixed width covers the whole duration.

## Functional Requirements

### FR1: Args
- `buildWaveformArgs({ inputPath, outputPath, options })` returns an argv array; no shell string is ever built.
- Defaults: 1200×120, `colors=white`, transparent background.
- Width is clamped to 64..4096 and height to 16..512, so a caller cannot ask for an unbounded image.
- Colours must match `#rrggbb`, `#rrggbbaa`, or a bare colour name; anything else is rejected with `MediaError("invalid-option")`.
- The output path is the final argv element.

### FR2: Endpoint
- `GET /api/media/waveform?root=<abs>&width=<n>&height=<n>` renders once and caches the PNG under the project's `cache/`, keyed by source path, size, and source mtime, so re-rendering happens only when the media changes.
- The response is `image/png` with `Cache-Control: no-store`; a project without media is `404`, a relative root `400`, another method `405`.
- A render failure surfaces FFmpeg's message rather than an empty image.

### FR3: Page
- The playback panel shows the waveform above the video's controls, sized to the panel.
- Clicking the waveform seeks proportionally to the media duration, and the click position is reported so a test can assert it.
- A project whose waveform cannot be rendered simply does not show one; playback still works.

## Acceptance Criteria

- [ ] Unit tests cover defaults, clamping, colour validation, and argv shape.
- [ ] Route tests cover a first render, a cached second call, and the error cases.
- [ ] `npm run check` and `npm run e2e` pass, with the walkthrough clicking the waveform to seek.

## Dependencies

- `runCommand`/`spawn` helpers and `probeMedia` (complete).
- Media route and playback screen (complete).

## Risks

- Rendering a waveform for a feature-length file takes seconds; the cache makes that once per file, and the endpoint reports FFmpeg's failure instead of hanging.
