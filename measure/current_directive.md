# Current Directive

## Context
The workspace has an orphaned track state:
- Track `feature_text_driven_editing_core_20260502` is marked COMPLETED in `measure/tracks.md` but its folder is still in `measure/tracks/` (not archived)
- Track `media_test_coverage_20260425` has pending Phase 2 tasks (pipeline tests)
- No `current_directive.md` exists

## Actions
1. [x] Archive the orphaned track `feature_text_driven_editing_core_20260502` by moving it from `measure/tracks/` to `measure/archive/`
2. [x] Archive the orphaned track `media_test_coverage_20260425` by moving it from `measure/tracks/` to `measure/archive/`
3. [x] Created new track `feature_waveform_tooltip_ui_20260508` for WaveformWidget tooltip UI (tech-debt item)

## Status
Track `feature_waveform_tooltip_ui_20260508` is IN PROGRESS. Tooltip methods implemented, PlaybackWindow integration done. Phase 3 pending: tracks.md update and commit.

## Top Tech-Debt Items (from measure/tech-debt.md)
1. **Medium: go build/vet timeout** - Requires ccache installation
2. **Low: Media package test coverage** - Pipeline tests skipped (hardware dependent)
3. **Low: WaveformWidget tooltip UI** - Hover tracking exists but tooltip display needs parent UI integration
4. **Low: SQLite schema migrations** - Need ALTER TABLE ADD COLUMN pattern for new columns
5. **Low: Whisper CLI dependency** - Model downloader works but binary needs installation