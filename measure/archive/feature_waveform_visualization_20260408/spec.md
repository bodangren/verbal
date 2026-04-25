# Specification: Waveform Visualization

## Overview
Add an audio waveform visualization to the playback view that displays the audio amplitude over time. This provides users with visual cues for navigation, identifying speech patterns, and locating sections for editing. The waveform will be displayed above or alongside the transcription text, synchronized with video playback.

## Functional Requirements

### 1. Waveform Display
- Render audio waveform as a scrollable visualization
- Display amplitude (Y-axis) over time (X-axis)
- Show stereo channels (if applicable) or mixed mono waveform
- Use appropriate color scheme matching GNOME design (dark theme compatible)
- Display current playback position indicator (vertical line)

### 2. Data Generation
- Extract audio data from video files using GStreamer
- Generate waveform data efficiently (downsample to reasonable resolution)
- Cache generated waveform data to avoid re-processing
- Support common audio formats (AAC, MP3, WAV, FLAC)

### 3. User Interaction
- Click on waveform to seek to that position in video
- Drag to select time ranges for potential cuts
- Zoom in/out for detailed view or overview
- Scroll horizontally to navigate through long recordings
- Hover to show timestamp tooltip

### 4. Synchronization
- Waveform position indicator syncs with video playback
- Transcription word highlighting syncs with waveform position
- Smooth updates at 10fps (matching existing sync rate)

### 5. Performance
- Generate waveform data asynchronously (background thread)
- Display loading state while generating
- Handle large files efficiently (1+ hour recordings)
- Memory-efficient data storage for waveform samples

## Non-Functional Requirements

### Technical
- GTK4 DrawingArea or custom widget for rendering
- GStreamer for audio extraction and analysis
- Go routines for non-blocking waveform generation
- SQLite cache for waveform data persistence

### UX
- Responsive design that scales with window size
- Smooth scrolling and zooming
- Clear visual feedback during interactions
- Accessible (keyboard navigation support)

## Acceptance Criteria
- [ ] Waveform displays correctly for video files with audio
- [ ] Waveform generation completes within 5 seconds for 10-minute video
- [ ] Clicking waveform seeks video to correct position (±100ms accuracy)
- [ ] Position indicator stays synchronized during playback
- [ ] Loading state shown while generating waveform
- [ ] Cached waveform loads instantly on reopening file
- [ ] UI remains responsive during waveform generation
- [ ] Dark theme compatible color scheme
- [ ] Tests achieve >80% coverage

## Out of Scope
- Real-time waveform during recording (future feature)
- Audio spectrum/frequency visualization (FFT analysis)
- Multiple audio track visualization
- Waveform editing (cut/trim directly on waveform)
- Export waveform as image

## Design Notes
- Position waveform above transcription text in the bottom pane
- Use existing GNOME blue (#3584E4) for position indicator
- Waveform color: subtle gray/white gradient on dark background
- Selected range highlight: semi-transparent accent color
