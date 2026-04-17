# Specification: Manual Test Readiness and Project Status Audit

## Goal

Provide a current, evidence-backed project update and a practical manual test plan for Verbal's native Linux/GNOME app surface.

## Scope

- Read Conductor routing files, registry, current directive, product definition, tech stack, lessons learned, and tech debt.
- Run available automated verification commands that can execute from the repository.
- Identify remaining risks that require display, hardware, media samples, or API keys.
- Produce a manual QA checklist covering the user-facing workflows currently tracked by Conductor.

## Acceptance Criteria

- Project status summarizes completed, active, planned, and residual-risk areas.
- Automated verification results include exact commands and outcomes.
- Manual test plan includes setup commands, workflow steps, and expected results.
- Any failures or blocked checks are separated from implementation regressions.

## Out of Scope

- Feature implementation or bug fixes.
- Cloud transcription calls using real API keys unless explicitly requested.
- Hardware-specific validation that requires the user to operate webcam/microphone manually.
