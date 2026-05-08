# Plan: Export Presets and Profiles

## Phase 1: Preset Data Model (TDD)
- [ ] Write tests for PresetRepository
- [ ] Add export_presets table with schema
- [ ] Implement CRUD for presets
- [ ] Seed built-in presets on first run
- [ ] Tests pass

## Phase 2: Export Dialog Integration
- [ ] Add preset dropdown to export dialog
- [ ] Wire preset selection to codec detection and stream-copy logic
- [ ] Add "Save as Custom Preset" button
- [ ] Tests pass

## Phase 3: Settings Management
- [ ] Add presets panel to SettingsWindow
- [ ] Allow edit/delete of custom presets
- [ ] Built-in presets are read-only
- [ ] Manual verification

## Phase 4: Verification
- [ ] Full test suite pass
- [ ] Build and vet clean
- [ ] Update lessons-learned.md
- [ ] Commit and push
