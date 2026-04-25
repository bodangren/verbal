# Implementation Plan: Visual Refresh: Define Unique Identity

## Phase 1: Define Visual Identity
- [x] Read the current `DESIGN.md` and project code to understand the domain.
- [x] Brainstorm and select a highly opinionated visual theme that fits the domain perfectly.
- [x] Update `DESIGN.md` with specific color tokens, typography, and styling rules (no generic slop).
- [x] Run `npx -y @google/design.md lint DESIGN.md` to ensure structural compliance.

## Phase 2: Refactor UI Components
- [x] Update global CSS (styling.go) to match the new `DESIGN.md`.
- [ ] Verify the visual refresh locally (requires GTK display).
- [ ] Review component consistency across UI.

## Verification
- `make go-check` - pass (all 11 packages)
- `npx @google/design.md lint DESIGN.md` - pass (0 errors)