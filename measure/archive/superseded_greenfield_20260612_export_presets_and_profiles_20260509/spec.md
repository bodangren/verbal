# Track: Export Presets and Profiles

## Problem
Export currently requires manually selecting codec and quality each time. Users need one-click export presets for common destinations (YouTube, podcast, archive).

## Goal
Add named export presets that pre-configure resolution, codec, bitrate, and container format. Allow users to create custom presets.

## Acceptance Criteria
- [ ] Built-in presets: YouTube 1080p, Podcast Audio, Archive (lossless), Web Preview
- [ ] Preset selection in export dialog with description tooltip
- [ ] Custom preset creation and persistence to SQLite
- [ ] Presets store: name, resolution, videoCodec, audioCodec, bitrate, container
- [ ] Stream-copy used when source matches preset codec
- [ ] Tests pass
- [ ] Build and vet clean
