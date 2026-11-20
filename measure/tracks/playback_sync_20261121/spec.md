# Specification: Playback and Sync

## Overview

`PlaybackScreen` renders a video with a synchronised, click-to-seek transcript, and `useActiveWord` already follows playback — but nothing renders the component and no route serves the media, so the product's "high-performance playback" promise is unreachable from the UI. This track makes imported media playable inside the page.

## Goals

1. Serve a project's media over HTTP, with byte ranges so seeking works in `<video>`.
2. Render the playback screen in the page whenever the open project has media.
3. Keep the transcript in sync: the active word follows playback, and clicking a word seeks.
4. Keep transcript editing and playback usable side by side.

## Non-Goals

- Ripple preview of cuts during playback (a later track).
- Waveform or timeline visualisation (a separate track).
- Transcoding or proxy generation; the media is served as imported.
- Multi-track audio mixing.

## Functional Requirements

### FR1: Media path resolution
- The served file is the one the project document references: `media.assetPath` (project-relative) preferred, else `media.externalPath` (absolute).
- A project-relative path is resolved inside the project root by `resolveInsideProject`; nothing outside it is served.
- A project with no media resolves to "no media" rather than throwing.

### FR2: Media route
- `GET /api/media/file?root=<absolute path>` serves the referenced file.
- Responses carry the correct `Content-Type`, `Content-Length`, and `Accept-Ranges: bytes`.
- A request with `Range: bytes=<start>-<end>` returns `206` with `Content-Range`; an open-ended range runs to the end of file; a suffix range (`bytes=-N`) returns the last N bytes.
- A range that starts at or past the end returns `416` with `Content-Range: bytes */<size>`.
- A malformed range header is ignored and the whole file is served.
- A missing file is `404`; a project root that is not absolute is `400`; a method other than `GET`/`HEAD` is `405`.

### FR3: Page wiring
- When the open project has media, the page renders a *Playback* panel containing the video, a Play button, and the transcript.
- When it has none, the page says so and links no media.
- The media URL is derived from the project root, so it survives a page reload.

### FR4: Sync
- The word being spoken is marked with `data-active` as playback advances.
- Clicking a word seeks the video to that word's start and does not start playback.
- Removed words are not clickable and are not highlighted.

## Acceptance Criteria

- [ ] `parseByteRange` handles closed, open-ended, suffix, malformed, and unsatisfiable ranges.
- [ ] The media route returns 200/206/416/404/400/405 as specified, with correct headers.
- [ ] Range requests against a real file return exactly the requested bytes.
- [ ] The page shows the playback panel for a project with media and plays it in the browser walkthrough.
- [ ] The active word and click-to-seek work in the browser walkthrough.
- [ ] `npm run check` and `npm run e2e` pass.

## Non-Functional Requirements

- Range parsing and path resolution are pure functions with unit tests.
- The route streams the file; it never reads the whole file into memory.
- No new dependency: `node:fs` streams and `node:http` are enough.

## Dependencies

- `@verbal/core` project document, `resolveInsideProject` (complete).
- `PlaybackScreen`, `useActiveWord` (complete, unrendered).
- Media import writing `assets/` (complete).

## Open Decisions

- **Serving scope:** only the file recorded in `project.json` is served, not any path the client names. A path parameter would be an arbitrary-file-read endpoint.
- **HEAD:** supported, since media players probe it before ranged reads.
- **Edits during playback:** playback plays the untouched media. Reflecting cuts requires a rendered proxy, which belongs to the ripple-preview track; the transcript still highlights and seeks correctly.

## Risks

- Chromium requires a correct `Content-Type` and range support to scrub; a wrong type shows a black frame with no error.
- `media.externalPath` bypasses import copying, so a moved file 404s. The page surfaces that error instead of failing silently.
