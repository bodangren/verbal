# Product Definition: Verbal

## Vision
Verbal is a **local-first, AI-powered video/audio editor** for Linux where users edit media by modifying a transcript. By treating media editing like word processing, Verbal brings the intuitive "document-style" paradigm to a native, high-performance Linux environment (GNOME/GTK).

## Target Audience
- **Linux Content Creators:** Developers and power users on Ubuntu/GNOME who need reliable, native media tools.
- **Podcasters and Video Creators:** Individuals looking for a frictionless way to edit long-form content.
- **Privacy-Conscious Users:** Creators who prefer local processing and tight hardware integration over browser-based or cloud-heavy tools.

## Core Value Proposition
- **Edit via Text:** Text is the source of truth; deleting or reordering text automatically synchronizes the media timeline.
- **Native Linux Reliability:** Direct integration with V4L2 (webcam), PipeWire/PulseAudio (mic), and GStreamer for frame-accurate, high-performance media handling.
- **Tight GNOME Integration:** Built with GTK4 and Libadwaita for a seamless, modern Linux desktop experience.
- **AI-Powered Intelligence:** Word-level timestamps and transcription powered by OpenAI (Whisper) or Google (Speech-to-Text).

## Key Features
1. **Automated Transcription & Timestamping:** Generates word-level timestamps (JSON format) perfectly synced with media.
2. **Text-Driven Editing:** Cutting, deleting, or reordering text in the editor triggers real-time media timeline recalculation.
3. **High-Performance Playback:** Frame-accurate seeking and real-time cursor highlighting synced between text and video.
4. **Native Media Engine:** Built on GStreamer for robust recording (webcam/mic) and efficient export (MP4/WAV) with stream-copy optimizations.
5. **Filler Word Detection:** Identify and remove "ums," "ahs," and dead air via AI-driven transcript analysis.
6. **Project Persistence:** Local storage for media assets, transcripts, and edit history.

## Success Metrics
- **Hardware Stability:** Reliable webcam/mic access without browser sandbox limitations.
- **Sync Precision:** No drift between transcript edits and exported media.
- **Performance:** Seek latency < 100ms and smooth 1080p playback.
- **UX Fluidity:** A "GNOME-native" feel that adheres to modern HIG (Human Interface Guidelines).

## Editing Operations (v1)
| Action          | Behavior                            |
| --------------- | ----------------------------------- |
| Delete word     | Removes corresponding media segment |
| Delete sentence | Cuts full time range                |
| Reorder text    | Rearranges timeline                 |
| Insert silence  | Adds gap                            |
| Split paragraph | Creates new segment                 |
