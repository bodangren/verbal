# Product Definition: Verbal

## Vision
Verbal is a next-generation desktop media editor designed primarily for Linux, bringing the intuitive "document-style" video and audio editing paradigm to local environments. By treating media editing like word processing, Verbal aims to make video production accessible, fast, and frictionless.

## Target Audience
- **Podcasters and Video Creators:** Individuals looking for a frictionless way to edit their long-form content.
- **Social Media Managers:** Marketers who need to quickly extract viral short-form clips.
- **Linux Users:** Creators on Linux lacking professional, AI-powered desktop editing options comparable to Descript.

## Core Value Proposition
- **Frictionless Editing:** Edit video by simply deleting or moving text in the generated transcript.
- **Unified AI Engine:** Seamlessly toggle between Google (Vertex AI/Gemini) and OpenAI ecosystems for all AI intelligence features, preventing vendor lock-in.
- **Privacy and Cost Efficiency:** Hybrid architecture keeps resource-heavy media processing (rendering, DSP audio cleanup, background removal) local, relying on API calls only for core AI intelligence.

## Key Features
1. **Automated Transcription & Timestamping:** Word-level timestamps perfectly synced with the video (via Whisper-v4 or Gemini Multimodal).
2. **Filler Word Detection:** Auto-identifies "ums," "ahs," and dead air for simple removal via LLM parsing (GPT-5.4-nano or Gemini 3.0).
3. **Text-Based Video Editing:** Deleting text automatically slices the underlying video locally using FFmpeg.
4. **Viral Auto-Clipping:** Uses LLM intelligence to find hooks and extract 60-second vertical clips.
5. **Generative B-Roll:** Integrates with Sora 2 or Veo 3.1 to create context-aware cutaways.
6. **Voice Cloning & Overdub:** Fix mistakes by typing, synthesizing audio in the original voice (OpenAI Voice or Gemini 3 Flash Native Audio).
7. **Local Studio Sound:** Audio enhancement done via local DSP (FFmpeg).
8. **Dynamic Captions:** Local WebGL-based captions rendering.

## Success Metrics
- Seamless text-to-video timeline synchronization.
- Low latency when editing (thanks to local processing).
- Robust and smooth switching between OpenAI and Google API ecosystems.