# Track Specification: Video Playback with Transcription Synchronization

## Overview
Enable users to view transcribed recordings with synchronized video playback. Words in the transcription highlight as the video plays, and clicking a word jumps the video to that timestamp.

## User Story
As a user who has recorded and transcribed a video, I want to review the transcription alongside the video playback with synchronized highlighting so that I can easily navigate to specific parts of the recording by clicking on transcribed words.

## Functional Requirements

### 1. Synchronized Playback
- **FR1.1**: Video playback position is linked to transcription highlighting
- **FR1.2**: Currently spoken word is visually highlighted in the transcription view
- **FR1.3**: Highlight updates smoothly as video progresses

### 2. Interactive Navigation
- **FR2.1**: Clicking any word in transcription jumps video to that timestamp
- **FR2.2**: Visual feedback when hovering over clickable words
- **FR2.3**: Smooth seek animation when jumping to timestamps

### 3. UI Layout
- **FR3.1**: Split-pane view with video on left, transcription on right
- **FR3.2**: Video maintains aspect ratio during resize
- **FR3.3**: Transcription panel is scrollable with word-level layout

### 4. Performance
- **FR4.1**: Highlight updates at 10fps minimum without UI lag
- **FR4.2**: Seek operations complete within 100ms
- **FR4.3**: Memory usage remains stable during playback

## Non-Functional Requirements

### 1. Accessibility
- **NFR1.1**: Highlight color meets WCAG AA contrast requirements
- **NFR1.2**: Keyboard navigation between words (Tab/Arrow keys)
- **NFR1.3**: Screen reader announces current word on highlight change

### 2. Error Handling
- **NFR2.1**: Graceful degradation if transcription file is missing
- **NFR2.2**: Clear error message if video file is corrupted
- **NFR2.3**: Handle seek beyond video duration gracefully

## Technical Constraints
- Use existing GStreamer video widget (`internal/gstreamer.VideoWidget`)
- Leverage existing transcription data structures (`internal/transcription`)
- GTK4 widget architecture with proper thread safety
- No additional external dependencies

## Success Criteria
- [ ] Video plays with synchronized word highlighting
- [ ] Clicking a word seeks video to correct timestamp
- [ ] UI remains responsive at all times
- [ ] Split-pane layout is resizable
- [ ] All tests pass (>80% coverage)
- [ ] No memory leaks during extended playback

## Dependencies
- Completed transcription service (✅)
- Video playback widget (✅)
- Word-level timestamps in transcription data (✅)

## Out of Scope
- Editing transcription text (next track)
- Exporting cut segments (future track)
- Multiple language support
- Real-time transcription during recording
