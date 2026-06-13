# Plan: Export Presets and Profiles

## Phase 1: Preset Data Model (TDD)
- [~] Write tests for PresetRepository
- [~] Add export_presets table with schema
- [~] Implement CRUD for presets
- [~] Seed built-in presets on first run
- [~] Tests pass

### Phase 1 — Red notes (MID attempt, 2026-06-13)

Red contract written for the PresetRepository data model. Tests live in
`internal/db/preset_repository_test.go` and reference symbols that do
not exist yet (e.g. `Preset`, `PresetContainerMP4`, `Database.PresetRepo()`,
`BuiltinPresetsForTest()`, `SeedBuiltins()`) — so the package fails to
compile. That is the expected Red outcome for this phase; the Green-phase
author must add the migration, types, repository methods, and golden-table
helper without weakening any of the contracts below.

**Targeted Red command** (per test-strategy.md §7 Phase 1):

```
go test ./internal/db/ -run TestPresetRepository -count=1 -v
```

**Result at MID commit:** `FAIL verbal/internal/db [build failed]` (exit 1).
The `go test` runner reports 20+ undefined-symbol compile errors
(`Preset`, `PresetContainerMP4`, `Database.PresetRepo`, `SeedBuiltins`,
`BuiltinPresetsForTest`, etc.). No test case ran — the build itself fails
Red because none of the production types exist. This is the canonical
Red state for Phase 1; the live SQLite + migration proof will be exercised
by the Phase 1 Green gate (`go test ./internal/db/ -run 'TestPresetRepository|TestMigrationVersions' -count=1`).

**Contracts pinned by the Red contract** (Green must satisfy all of them):

1. **Append-only migration.** A new version > 7 is added to
   `internal/db/migrations.go:22` (existing versions 1–7 untouched).
   `TestPresetMigration_IsAppendOnly` fails if a Green author reuses a
   version number.
2. **Schema shape.** The `export_presets` table has columns:
   `id, name, container, video_codec, audio_codec, bitrate, width, height,
   is_builtin, description, created_at, updated_at`
   (`TestPresetMigration_SchemaShape`).
3. **Validators at the repo boundary.** `Create` rejects empty /
   whitespace names, embedded `\n`/`\r` control characters in the name,
   containers outside `{mp4, mkv, webm, wav, m4a}`, and bitrate ≤ 0
   (`TestPresetRepository_Create_Rejects*`).
4. **Name uniqueness.** `Create` rejects a duplicate name
   (`TestPresetRepository_Create_RejectsDuplicateName`).
5. **CRUD surface.** `Create / GetByID / GetByName / List / Update / Delete`
   all behave per spec (`TestPresetRepository_*` family).
6. **Built-in immutability.** `Update` and `Delete` reject rows with
   `is_builtin=1`; defence in depth at the repository layer
   (`TestPresetRepository_Update_RejectsBuiltinMutation`,
   `TestPresetRepository_Delete_RejectsBuiltin`).
7. **List ordering.** `List` returns built-ins before custom presets,
   custom presets sorted by name ascending
   (`TestPresetRepository_List_ReturnsBuiltinsFirstThenCustomByName`).
8. **SeedBuiltins idempotency.** Calling `SeedBuiltins` repeatedly does
   not duplicate rows
   (`TestPresetRepository_SeedBuiltins_Idempotent`).
9. **SeedBuiltins respects user edits.** Re-seeding must NOT overwrite a
   user-customised row that happens to share a built-in name
   (`TestPresetRepository_SeedBuiltins_DoesNotOverwriteCustomPresetSharingBuiltinName`).
10. **Golden table covers spec acceptance criteria.** `BuiltinPresetsForTest`
    includes "YouTube 1080p", "Podcast Audio", "Archive", "Web Preview",
    all with `IsBuiltin=true`, positive bitrate, positive resolution
    (`TestBuiltinPresetsForTest_CoversRequiredNames`).

**Cross-phase notes** (test-strategy.md §3, §4 — also enforced here):

- `migrations_compat_test.go` must continue to pass — proves no version
  reuse on the existing 1–7 chain.
- No new top-level packages: production code goes in
  `internal/db/preset_repository.go`.
- No GStreamer / FFmpeg imports from preset/repository code
  (provider-agnostic rule); no OpenAI/Google SDK imports anywhere.

**Dirty worktree handling.** At MID start the worktree contained several
untracked files unrelated to this track
(`internal/db/repository_edge_test.go`, `service_edge_test.go`,
`settings_edge_test.go`, `thumbnail_edge_test.go`,
`internal/ui/livecaptionwidget_test.go`, `measure/archive/...`,
`measure/automation-script.sh`, `measure/automation-supervisor.py`,
`measure/runs/`, plus sibling track folders under `measure/tracks/`).
Per the MID dirty-worktree protocol these are classified as unrelated
user work and were NOT touched or committed in this Red phase — they
are preserved in the working tree for the user (or the responsible
track) to commit separately. The only files this Red commit adds are
the new test file and the plan update.

**Aggregate-suite safety.** Per test-strategy.md §7 "Aggregate-suite
hazards", the new test file is paired with this Red commit and is
expected to flip Green within the same Phase 1 cycle. If Phase 1 is
paused mid-Red, the implementer MUST annotate the file with
`t.Skip("WIP: track export_presets_and_profiles_20260509 phase 1 — owned by [~] task")`
before any aggregate `make go-check` runs (Phase 4 gate). At the time
of this MID commit the file is left intentionally failing Red because
that is its purpose.

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
