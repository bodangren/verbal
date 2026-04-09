# Specification: Video Thumbnails for Library Items

## Overview
Implement video thumbnail generation for recording library items. Thumbnails will be extracted from video files using GStreamer and stored in the SQLite database as base64-encoded JPEG images. The library view will display these thumbnails alongside recording metadata for visual identification.

## Functional Requirements

1. **Thumbnail Generation**
   - Extract a single frame from each video at the 1-second mark (or 10% into the video if shorter)
   - Resize frame to 160x90 pixels (16:9 aspect ratio, 1/4 of 640x360)
   - Encode as JPEG with 85% quality for balance of size and clarity
   - Store as base64-encoded string in the database

2. **Database Storage**
   - Add `thumbnail_data` TEXT column to recordings table (nullable)
   - Add `thumbnail_generated_at` TIMESTAMP column to track freshness
   - Store MIME type (image/jpeg) alongside the data

3. **Lazy Generation**
   - Generate thumbnails on-demand when recordings are first viewed in library
   - Cache results to avoid regenerating
   - Show placeholder icon while generating

4. **Library View Integration**
   - Display thumbnail in list/grid view next to recording title
   - Show duration overlay on thumbnail (bottom-right corner)
   - Maintain 16:9 aspect ratio in UI

5. **Error Handling**
   - Gracefully handle corrupt or unreadable video files
   - Show generic video icon when thumbnail generation fails
   - Log errors without blocking UI

## Non-Functional Requirements

1. **Performance**
   - Thumbnail generation must complete within 2 seconds per video
   - Background generation must not block UI thread
   - Database queries with thumbnails must remain under 100ms

2. **Storage**
   - Maximum thumbnail size: 50KB per image
   - Total storage overhead should be <5% of video file sizes

3. **Compatibility**
   - Support all video formats supported by GStreamer (MP4, WebM, AVI, MOV)
   - Handle videos without video streams (audio-only) gracefully

## Acceptance Criteria

- [ ] Thumbnails display for all video recordings in library view
- [ ] Thumbnails are generated at 160x90 resolution as JPEG
- [ ] Thumbnails persist across application restarts
- [ ] Generation happens in background without blocking UI
- [ ] Placeholder shown during generation and for failed/corrupt videos
- [ ] Duration overlay displays correctly on thumbnails
- [ ] All tests pass with >80% coverage
- [ ] Memory usage remains stable during batch thumbnail generation

## Out of Scope

- Video preview on hover
- Multiple thumbnail extraction (scene detection)
- Configurable thumbnail time position
- Thumbnail caching to filesystem (database only)
- Batch regeneration UI