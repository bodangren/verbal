package db

import (
	"path/filepath"
	"strings"
	"testing"
)

// Red-phase contract tests for the Export Presets and Profiles track,
// Phase 1: Preset Data Model (TDD).
//
// See measure/tracks/export_presets_and_profiles_20260509/test-strategy.md
// §5 (Phase 1 — Repository TDD) for the per-phase test plan and §7 for the
// targeted Red command:
//
//	go test ./internal/db/ -run TestPresetRepository -count=1 -v
//
// The Green-phase author must add:
//   - a numbered migration (Version > 7, append-only — see
//     internal/db/migrations.go:20-22) that creates the `export_presets`
//     table with the columns asserted by TestPresetMigration_SchemaShape,
//   - the Preset struct, PresetContainer* constants, and the
//     PresetRepository type with the methods exercised below,
//   - a Database.PresetRepo() accessor,
//   - a BuiltinPresetsForTest() helper used by both seed tests and Phase 2
//     dialog tests,
//   - a SeedBuiltins() method that UPSERTs by name and never overwrites a
//     user-edited custom preset (defence in depth).
//
// All tests in this file reference symbols that do not exist yet, so the
// package will fail to compile when the targeted Red command runs. That is
// the expected Red outcome. The Green-phase author must make these tests
// pass without removing or weakening any of the contracts below.

// ----------------------------------------------------------------------------
// Migration shape
// ----------------------------------------------------------------------------

func TestPresetMigration_CreatesTable(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	var name string
	if err := database.GetDB().QueryRow(
		`SELECT name FROM sqlite_master WHERE type='table' AND name='export_presets'`,
	).Scan(&name); err != nil {
		t.Fatalf("expected export_presets table to exist after Migrate(): %v", err)
	}
	if name != "export_presets" {
		t.Errorf("expected table name 'export_presets', got %q", name)
	}
}

func TestPresetMigration_Idempotent(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	for i := 0; i < 3; i++ {
		if err := Migrate(database.GetDB()); err != nil {
			t.Fatalf("Migrate() iteration %d error = %v", i, err)
		}
	}
}

func TestPresetMigration_SchemaShape(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	rows, err := database.GetDB().Query(`PRAGMA table_info(export_presets)`)
	if err != nil {
		t.Fatalf("PRAGMA table_info(export_presets): %v", err)
	}
	defer rows.Close()

	got := map[string]string{}
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull int
		var dfltValue interface{}
		var pk int
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dfltValue, &pk); err != nil {
			t.Fatalf("scan column: %v", err)
		}
		got[name] = typ
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate columns: %v", err)
	}

	required := []string{
		"id", "name", "container", "video_codec", "audio_codec",
		"bitrate", "width", "height", "is_builtin", "description",
		"created_at", "updated_at",
	}
	for _, col := range required {
		if _, ok := got[col]; !ok {
			t.Errorf("export_presets missing required column %q (got %v)", col, got)
		}
	}
}

func TestPresetMigration_IsAppendOnly(t *testing.T) {
	// Append-only enforcement: the highest registered version must be the
	// Phase 1 version (>7 — existing migrations stop at 7 in
	// internal/db/migrations.go:22). If a Green author reuses a version
	// number, this test fails.
	versions := MigrationVersions()
	if len(versions) == 0 {
		t.Fatal("MigrationVersions() returned empty list")
	}
	top := versions[len(versions)-1]
	if top <= 7 {
		t.Errorf("expected a new migration version > 7 (Phase 1 export_presets), got top=%d", top)
	}
}

// ----------------------------------------------------------------------------
// CRUD: Create / GetByID / GetByName / List / Update / Delete
// ----------------------------------------------------------------------------

func TestPresetRepository_Create(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	p := &Preset{
		Name:        "My Custom 1080p",
		Container:   PresetContainerMP4,
		VideoCodec:  "h264",
		AudioCodec:  "aac",
		Bitrate:     8_000_000,
		Width:       1920,
		Height:      1080,
		IsBuiltin:   false,
		Description: "Custom 1080p H.264 profile",
	}
	saved, err := repo.Create(p)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if saved == nil {
		t.Fatal("Create() returned nil preset")
	}
	if saved.ID == 0 {
		t.Error("Create() did not populate ID")
	}
	if saved.Name != p.Name {
		t.Errorf("Name = %q, want %q", saved.Name, p.Name)
	}
	if saved.IsBuiltin {
		t.Error("IsBuiltin = true, want false for user-created preset")
	}
	if saved.CreatedAt.IsZero() {
		t.Error("CreatedAt not populated")
	}
	if saved.UpdatedAt.IsZero() {
		t.Error("UpdatedAt not populated")
	}
}

func TestPresetRepository_Create_RejectsInvalidContainer(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	cases := []string{"", "avi", "flv", "mov", "MP4-not-allowed-when-uppercase-not-normalised"}
	for _, c := range cases {
		p := &Preset{
			Name:       "bad-container-" + c,
			Container:  c,
			VideoCodec: "h264",
			AudioCodec: "aac",
			Bitrate:    1_000_000,
			Width:      1280,
			Height:     720,
		}
		if _, err := repo.Create(p); err == nil {
			t.Errorf("Create(container=%q) succeeded, want error for invalid container", c)
		}
	}
}

func TestPresetRepository_Create_RejectsZeroOrNegativeBitrate(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	for _, br := range []int64{0, -1, -1000} {
		p := &Preset{
			Name:       "bad-bitrate",
			Container:  PresetContainerMP4,
			VideoCodec: "h264",
			AudioCodec: "aac",
			Bitrate:    br,
			Width:      1280,
			Height:     720,
		}
		if _, err := repo.Create(p); err == nil {
			t.Errorf("Create(bitrate=%d) succeeded, want error for non-positive bitrate", br)
		}
	}
}

func TestPresetRepository_Create_RejectsEmptyName(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	for _, name := range []string{"", "   ", "\t"} {
		p := &Preset{
			Name:       name,
			Container:  PresetContainerMP4,
			VideoCodec: "h264",
			AudioCodec: "aac",
			Bitrate:    1_000_000,
			Width:      1280,
			Height:     720,
		}
		if _, err := repo.Create(p); err == nil {
			t.Errorf("Create(name=%q) succeeded, want error for empty/whitespace name", name)
		}
	}
}

func TestPresetRepository_Create_RejectsDuplicateName(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	first := &Preset{
		Name:       "DupName",
		Container:  PresetContainerMP4,
		VideoCodec: "h264",
		AudioCodec: "aac",
		Bitrate:    1_000_000,
		Width:      1280,
		Height:     720,
	}
	if _, err := repo.Create(first); err != nil {
		t.Fatalf("Create(first) error = %v", err)
	}

	dup := &Preset{
		Name:       "DupName",
		Container:  PresetContainerMKV,
		VideoCodec: "h264",
		AudioCodec: "aac",
		Bitrate:    2_000_000,
		Width:      1920,
		Height:     1080,
	}
	if _, err := repo.Create(dup); err == nil {
		t.Error("Create(dup) succeeded, want error for duplicate name")
	}
}

func TestPresetRepository_Create_RejectsEmbeddedNewlineInName(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	for _, name := range []string{"bad\nname", "bad\rname", "bad\r\nname"} {
		p := &Preset{
			Name:       name,
			Container:  PresetContainerMP4,
			VideoCodec: "h264",
			AudioCodec: "aac",
			Bitrate:    1_000_000,
			Width:      1280,
			Height:     720,
		}
		if _, err := repo.Create(p); err == nil {
			t.Errorf("Create(name=%q) succeeded, want error for embedded control character", name)
		}
	}
}

func TestPresetRepository_GetByID(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	created, err := repo.Create(&Preset{
		Name:       "GetByID target",
		Container:  PresetContainerMKV,
		VideoCodec: "h264",
		AudioCodec: "aac",
		Bitrate:    4_000_000,
		Width:      1280,
		Height:     720,
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	got, err := repo.GetByID(created.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID = %d, want %d", got.ID, created.ID)
	}
	if got.Name != created.Name {
		t.Errorf("Name = %q, want %q", got.Name, created.Name)
	}
	if got.Container != created.Container {
		t.Errorf("Container = %q, want %q", got.Container, created.Container)
	}
	if got.Bitrate != created.Bitrate {
		t.Errorf("Bitrate = %d, want %d", got.Bitrate, created.Bitrate)
	}
}

func TestPresetRepository_GetByID_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()
	if _, err := repo.GetByID(99999); err == nil {
		t.Error("GetByID(99999) returned nil error, want error")
	}
}

func TestPresetRepository_GetByName(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	created, err := repo.Create(&Preset{
		Name:       "Unique Target Name",
		Container:  PresetContainerWebM,
		VideoCodec: "vp9",
		AudioCodec: "opus",
		Bitrate:    2_000_000,
		Width:      1280,
		Height:     720,
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	got, err := repo.GetByName("Unique Target Name")
	if err != nil {
		t.Fatalf("GetByName() error = %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID = %d, want %d", got.ID, created.ID)
	}
}

func TestPresetRepository_GetByName_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()
	if _, err := repo.GetByName("does-not-exist"); err == nil {
		t.Error("GetByName(does-not-exist) returned nil error, want error")
	}
}

func TestPresetRepository_List_ReturnsBuiltinsFirstThenCustomByName(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	for _, name := range []string{"My Custom Z", "My Custom A"} {
		if _, err := repo.Create(&Preset{
			Name:       name,
			Container:  PresetContainerMP4,
			VideoCodec: "h264",
			AudioCodec: "aac",
			Bitrate:    2_000_000,
			Width:      1280,
			Height:     720,
		}); err != nil {
			t.Fatalf("Create(%q) error = %v", name, err)
		}
	}
	if err := repo.SeedBuiltins(); err != nil {
		t.Fatalf("SeedBuiltins() error = %v", err)
	}

	got, err := repo.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(got) < 2 {
		t.Fatalf("List() returned %d items, want >= 2", len(got))
	}

	// Built-ins must come before custom presets.
	sawCustom := false
	for _, p := range got {
		if !p.IsBuiltin {
			sawCustom = true
			continue
		}
		if sawCustom && p.IsBuiltin {
			t.Errorf("builtin %q appears after a custom preset; built-ins must be first", p.Name)
		}
	}

	// Custom presets must be ordered by name ascending.
	var customNames []string
	for _, p := range got {
		if !p.IsBuiltin {
			customNames = append(customNames, p.Name)
		}
	}
	if len(customNames) != 2 {
		t.Fatalf("expected 2 custom presets in List(), got %d (%v)", len(customNames), customNames)
	}
	if customNames[0] != "My Custom A" || customNames[1] != "My Custom Z" {
		t.Errorf("custom presets not name-sorted: %v", customNames)
	}
}

func TestPresetRepository_List_Empty(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	got, err := repo.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(got) != 0 {
		t.Errorf("List() returned %d items, want 0 on empty table", len(got))
	}
}

func TestPresetRepository_Update_CustomPreset(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	created, err := repo.Create(&Preset{
		Name:       "Updatable",
		Container:  PresetContainerMP4,
		VideoCodec: "h264",
		AudioCodec: "aac",
		Bitrate:    2_000_000,
		Width:      1280,
		Height:     720,
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	created.Bitrate = 5_000_000
	created.Description = "updated"
	created.Width = 1920
	created.Height = 1080
	if err := repo.Update(created); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	got, err := repo.GetByID(created.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.Bitrate != 5_000_000 {
		t.Errorf("Bitrate = %d, want 5_000_000", got.Bitrate)
	}
	if got.Description != "updated" {
		t.Errorf("Description = %q, want %q", got.Description, "updated")
	}
	if got.Width != 1920 || got.Height != 1080 {
		t.Errorf("resolution = %dx%d, want 1920x1080", got.Width, got.Height)
	}
}

func TestPresetRepository_Update_RejectsBuiltinMutation(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()
	if err := repo.SeedBuiltins(); err != nil {
		t.Fatalf("SeedBuiltins() error = %v", err)
	}

	builtins := BuiltinPresetsForTest()
	if len(builtins) == 0 {
		t.Fatal("BuiltinPresetsForTest() returned empty golden table")
	}

	for _, b := range builtins {
		// Try to mutate the bitrate of a built-in.
		loaded, err := repo.GetByName(b.Name)
		if err != nil {
			t.Fatalf("GetByName(%q) error = %v", b.Name, err)
		}
		loaded.Bitrate = b.Bitrate + 1
		if err := repo.Update(loaded); err == nil {
			t.Errorf("Update() on builtin %q succeeded, want error (built-ins are immutable)", b.Name)
		}
	}
}

func TestPresetRepository_Delete_CustomPreset(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	created, err := repo.Create(&Preset{
		Name:       "Deletable",
		Container:  PresetContainerMP4,
		VideoCodec: "h264",
		AudioCodec: "aac",
		Bitrate:    2_000_000,
		Width:      1280,
		Height:     720,
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if err := repo.Delete(created.ID); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if _, err := repo.GetByID(created.ID); err == nil {
		t.Error("GetByID() after Delete() returned nil error, want error")
	}
}

func TestPresetRepository_Delete_RejectsBuiltin(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()
	if err := repo.SeedBuiltins(); err != nil {
		t.Fatalf("SeedBuiltins() error = %v", err)
	}

	builtins := BuiltinPresetsForTest()
	for _, b := range builtins {
		loaded, err := repo.GetByName(b.Name)
		if err != nil {
			t.Fatalf("GetByName(%q) error = %v", b.Name, err)
		}
		if err := repo.Delete(loaded.ID); err == nil {
			t.Errorf("Delete() on builtin %q succeeded, want error (built-ins are immutable)", b.Name)
		}
	}

	// Built-ins must still be present after the rejected deletes.
	for _, b := range builtins {
		if _, err := repo.GetByName(b.Name); err != nil {
			t.Errorf("builtin %q missing after rejected Delete(): %v", b.Name, err)
		}
	}
}

func TestPresetRepository_Delete_UnknownIDReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()
	if err := repo.Delete(99999); err == nil {
		t.Error("Delete(99999) returned nil error, want error")
	}
}

// ----------------------------------------------------------------------------
// Seed built-in presets on first run
// ----------------------------------------------------------------------------

func TestPresetRepository_SeedBuiltins_InsertsGoldenTable(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()
	if err := repo.SeedBuiltins(); err != nil {
		t.Fatalf("SeedBuiltins() error = %v", err)
	}

	got, err := repo.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(got) != len(BuiltinPresetsForTest()) {
		t.Errorf("List() returned %d items after SeedBuiltins(), want %d", len(got), len(BuiltinPresetsForTest()))
	}

	for _, want := range BuiltinPresetsForTest() {
		loaded, err := repo.GetByName(want.Name)
		if err != nil {
			t.Errorf("builtin %q missing after SeedBuiltins(): %v", want.Name, err)
			continue
		}
		if !loaded.IsBuiltin {
			t.Errorf("builtin %q: IsBuiltin = false, want true", want.Name)
		}
		if loaded.Container != want.Container {
			t.Errorf("builtin %q: Container = %q, want %q", want.Name, loaded.Container, want.Container)
		}
		if loaded.Bitrate != want.Bitrate {
			t.Errorf("builtin %q: Bitrate = %d, want %d", want.Name, loaded.Bitrate, want.Bitrate)
		}
		if loaded.VideoCodec != want.VideoCodec {
			t.Errorf("builtin %q: VideoCodec = %q, want %q", want.Name, loaded.VideoCodec, want.VideoCodec)
		}
		if loaded.AudioCodec != want.AudioCodec {
			t.Errorf("builtin %q: AudioCodec = %q, want %q", want.Name, loaded.AudioCodec, want.AudioCodec)
		}
		if loaded.Width != want.Width || loaded.Height != want.Height {
			t.Errorf("builtin %q: resolution = %dx%d, want %dx%d", want.Name, loaded.Width, loaded.Height, want.Width, want.Height)
		}
	}
}

func TestPresetRepository_SeedBuiltins_Idempotent(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	for i := 0; i < 3; i++ {
		if err := repo.SeedBuiltins(); err != nil {
			t.Fatalf("SeedBuiltins() iteration %d error = %v", i, err)
		}
	}

	got, err := repo.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(got) != len(BuiltinPresetsForTest()) {
		t.Errorf("List() returned %d items after repeated SeedBuiltins(), want %d (no duplicates)", len(got), len(BuiltinPresetsForTest()))
	}
}

func TestPresetRepository_SeedBuiltins_DoesNotOverwriteCustomPresetSharingBuiltinName(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	repo := database.PresetRepo()

	// First seed the built-ins so the schema is populated with the
	// canonical values.
	if err := repo.SeedBuiltins(); err != nil {
		t.Fatalf("SeedBuiltins() error = %v", err)
	}

	// Simulate a user renaming a custom preset to clash with a built-in
	// name — SeedBuiltins must NOT overwrite the user's row with the
	// canonical built-in values.
	original, err := repo.GetByName("YouTube 1080p")
	if err != nil {
		t.Fatalf("GetByName(YouTube 1080p) error = %v", err)
	}
	original.IsBuiltin = false
	original.Bitrate = 1234
	original.Description = "user-customised"
	if err := repo.Update(original); err != nil {
		t.Fatalf("Update(customised-YouTube-1080p) error = %v", err)
	}

	if err := repo.SeedBuiltins(); err != nil {
		t.Fatalf("SeedBuiltins() (second call) error = %v", err)
	}

	got, err := repo.GetByName("YouTube 1080p")
	if err != nil {
		t.Fatalf("GetByName(YouTube 1080p) after second seed: %v", err)
	}
	if got.Bitrate != 1234 {
		t.Errorf("SeedBuiltins() overwrote user-customised bitrate: got %d, want 1234", got.Bitrate)
	}
	if got.Description != "user-customised" {
		t.Errorf("SeedBuiltins() overwrote user description: got %q, want %q", got.Description, "user-customised")
	}
}

func TestBuiltinPresetsForTest_CoversRequiredNames(t *testing.T) {
	// Acceptance criterion: built-in presets include YouTube 1080p,
	// Podcast Audio, Archive (lossless), and Web Preview
	// (spec.md Acceptance Criteria, test-strategy.md §2).
	builtins := BuiltinPresetsForTest()
	if len(builtins) < 4 {
		t.Fatalf("BuiltinPresetsForTest() returned %d presets, want >= 4", len(builtins))
	}

	requiredNames := []string{"YouTube 1080p", "Podcast Audio", "Archive", "Web Preview"}
	for _, want := range requiredNames {
		found := false
		for _, b := range builtins {
			if strings.EqualFold(b.Name, want) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("BuiltinPresetsForTest() missing required name %q (got %v)", want, namesOf(builtins))
		}
	}

	for _, b := range builtins {
		if !b.IsBuiltin {
			t.Errorf("BuiltinPresetsForTest() entry %q has IsBuiltin=false", b.Name)
		}
		if b.Bitrate <= 0 {
			t.Errorf("BuiltinPresetsForTest() entry %q has non-positive bitrate %d", b.Name, b.Bitrate)
		}
		if b.Width <= 0 || b.Height <= 0 {
			t.Errorf("BuiltinPresetsForTest() entry %q has non-positive resolution %dx%d", b.Name, b.Width, b.Height)
		}
	}
}

func namesOf(ps []Preset) []string {
	out := make([]string, len(ps))
	for i, p := range ps {
		out[i] = p.Name
	}
	return out
}