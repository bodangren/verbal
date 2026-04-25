---
version: 1.0.0
name: Verbal Design System
colors:
  primary: "#3584E4"
  primary-hover: "#1C71D8"
  primary-focus: "#1A5FB4"
  error: "#C01C28"
  error-light: "#F8E8E9"
  success: "#1A7F37"
  success-light: "#E8F5E9"
  pending: "#656D76"
  pending-light: "#F5F5F5"
  on-primary: "#FFFFFF"
  surface: "#F6F6F6"
  card: "#FFFFFF"
  border: "#EAEAEA"
typography:
  display-lg:
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
  display-md:
    fontSize: 21px
    fontWeight: 700
    lineHeight: 1.2
  title-md:
    fontSize: 19px
    fontWeight: 700
    lineHeight: 1.3
  body-lg:
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.4
  body-md:
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  label-sm:
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.0
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
rounded:
  sm: 3px
  md: 6px
  lg: 8px
  full: 12px
---

# Verbal Design System

## Overview
Verbal is a local-first media analysis tool built with Go, GTK4, and Libadwaita. The design system adheres to the GNOME Human Interface Guidelines (HIG) while providing specific tokens for transcription and media management.

## Colors
The color palette is derived from the GNOME color palette and Libadwaita defaults.

- **Primary (#3584E4):** Used for highlights, selections, and primary actions.
- **Error (#C01C28):** Used for error states and destructive actions.
- **Success (#1A7F37):** Used for completed transcriptions and positive feedback.
- **Pending (#656D76):** Used for neutral states and background tasks.

## Typography
The system uses the default system font (usually Cantarell or Inter) with varying sizes and weights for hierarchy. Values are defined in pixels (converted from points for web compatibility).

- **Display Large (24px):** Used for library view titles.
- **Display Medium (21px):** Used for settings and dialog titles.
- **Body Large (15px):** Used for recording filenames.
- **Body Medium (13px):** Standard text and labels.
- **Label Small (11px):** Used for status badges and metadata.

## Spacing
Spacing follows a 4px grid system.

- **XS (4px):** Tight spacing for word labels and buttons.
- **SM (8px):** Standard margin for labels and status indicators.
- **MD (12px):** Padding for containers and transcription views.
- **LG (16px):** Spacing between major components.
- **XL (24px):** Padding for empty states and primary action buttons.

## Shapes
Corners are rounded to provide a modern, approachable feel consistent with Libadwaita.

- **SM (3px):** Used for individual word labels.
- **MD (6px):** Used for icons and thumbnails.
- **LG (8px):** Standard rounding for cards, transcription views, and panels.
- **Full (12px):** Used for status badges and pill-shaped elements.

## Components

### Recording List Item
A card-based component for displaying recording metadata. Uses `rounded.lg` and `colors.border`.

### Transcription View
A specialized container for word labels. Uses `colors.primary` for highlighted words and `rounded.lg` for the container.

### Status Badges
Pill-shaped labels indicating the state of a recording. Uses `rounded.full` and contextual background colors.

## Do's and Don'ts
- **Do** use `primary` for focus and selection states.
- **Do** use `rounded.lg` for all major UI containers.
- **Don't** use hardcoded colors; prefer the defined design tokens.
- **Don't** mix multiple font families; stick to the system font.
