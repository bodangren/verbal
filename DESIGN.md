---
version: 1.0.0
name: Verbal Design System
colors:
  # Core palette - Deep charcoal with warm undertone
  surface: "#1E1E1E"
  surface-elevated: "#2A2A2A"
  surface-overlay: "#333333"
  card: "#252525"

  # Borders and dividers
  border: "#3D3D3D"
  border-subtle: "#2F2F2F"

  # Text hierarchy
  text-primary: "#F5F5F5"
  text-secondary: "#A0A0A0"
  text-tertiary: "#707070"

  # Accent - "Electric Indigo" - Distinctive but professional
  primary: "#6366F1"
  primary-hover: "#818CF8"
  primary-focus: "#4F46E5"

  # Semantic colors - muted with colored borders
  error: "#EF4444"
  error-surface: "#2D1B1B"
  success: "#22C55E"
  success-surface: "#1A2D1F"
  pending: "#A0A0A0"
  pending-surface: "#2A2A2A"

  # Highlight - used for word-level transcription sync
  highlight: "#6366F1"
  highlight-text: "#FFFFFF"
  highlight-hover: "#818CF8"

  # Selection - indigo tint for selection backgrounds
  selection: "#6366F1"
  focus-ring: "#6366F1"

typography:
  # Display - clean sans-serif for titles
  display-lg:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.2
  display-md:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.2

  # UI Text - compact and readable
  title-md:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.3
  body-lg:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  body-md:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5

  # Monospace - for timestamps, word indices, technical data
  mono:
    fontFamily: "JetBrains Mono, Fira Code, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.0

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px

rounded:
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px

motion:
  fast: 100ms
  normal: 200ms
  slow: 300ms
  easing: cubic-bezier(0.4, 0, 0.2, 1)
---

# Verbal Design System

## Identity: Professional Precision Studio

Verbal is a precision tool for transcription and media analysis. The design language reflects this: **dark, focused, technically precise**. No decorative flourishes. Every visual element serves the workflow.

The aesthetic is inspired by professional audio/video editing suites (DaVinci Resolve, Ableton) and terminal-based workflows - tools built for extended sessions and exacting precision.

## Colors

**Dark surfaces with warm undertones.** Not cold gray - the slight warmth reduces visual fatigue during long transcription sessions.

- **Surface (#1E1E1E):** Primary background. The app chrome.
- **Surface Elevated (#2A2A2A):** Cards, panels, dialogs. Layered on top of surface.
- **Card (#252525):** List items, recording cards. Slightly distinct from panels.
- **Border (#3D3D3D):** Subtle dividers. Visible but not distracting.

**Electric Indigo accent (#6366F1).** The one pop of color. Used for:
- Primary actions
- Word-level highlighting (transcription sync)
- Focus states
- Selected items

NOT used for decorative gradients or backgrounds.

**Text hierarchy:**
- Primary (#F5F5F5): Headings, filenames, important labels
- Secondary (#A0A0A0): Metadata, timestamps, supporting text
- Tertiary (#707070): Disabled states, placeholder text

**Semantic colors:** Muted surfaces with colored left borders. No filled backgrounds - the dark theme doesn't need color blocks.

## Typography

**Sans-serif for UI** (Inter or system default): Clean, legible at small sizes, professional.

**Monospace for data** (JetBrains Mono): Timestamps, word indices, duration displays. The precision instrument aesthetic.

Never: Comic Sans,papyrus, or decorative display fonts.

## Spacing

4px base grid. Tighter than typical "modern" spacing because this is a data-dense tool (word labels, timestamps, waveforms).

## Motion

Fast and subtle. 100-200ms transitions. No bounces or playful animations. The tool should feel responsive, not whimsical.

## Components

### Recording List Item
- Dark card (#252525) with subtle border (#3D3D3D)
- Thumbnail or icon on left
- Filename (primary text), duration + date (secondary), status badge (accent border)
- Hover: slightly elevated background, border lightens

### Transcription View
- Monospace word labels in a flowing layout
- Highlighted word: indigo background (#6366F1), white text, no border
- Hover: subtle background shift on word labels
- Selection: indigo tint background, thin indigo border

### Waveform Display
- Monospace timestamps (word indices or time)
- Waveform bars in secondary text color
- Playhead: vertical indigo line, 2px wide

### Status Badges
- No filled backgrounds. Left border only (3px, accent color).
- Monospace text, uppercase, letter-spacing for readability.

## Principles

1. **Dark, not gloomy.** Surfaces have enough contrast to feel crisp, not muddy.
2. **One accent color.** Everything non-neutral uses indigo. No random colors.
3. **Data is precise.** Timestamps and indices are monospace. This is a tool for exact work.
4. **Words are prominent.** The transcription view is the core feature - it gets visual prominence.
5. **No decorative elements.** No gradients on large surfaces, no drop shadows everywhere, no rounded corner excess.

## Anti-patterns

- **Don't** use gradient backgrounds ("modern" purple-to-blue hero sections)
- **Don't** use filled colored badges with white text
- **Don't** use serif fonts for UI elements
- **Don't** use soft pastel colors on dark backgrounds
- **Don't** use emoji icons or playful iconography
- **Don't** use excessive border-radius (max 8px, typically 4-6px)