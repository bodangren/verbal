package app

import (
	"context"
	"path/filepath"
	"testing"

	"verbal/internal/ai"
	"verbal/internal/db"
	"verbal/internal/settings"
	"verbal/internal/thumbnail"
	"verbal/internal/ui"
)

// TestSmokeCheckServiceGraph_CharacterizesServiceWiring asserts that the
// controller's smoke check can exercise the startup-critical service graph
// against a real database without opening GTK windows or failing.
func TestSmokeCheckServiceGraph_CharacterizesServiceWiring(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "recordings.db")
	ctrl := New(dbPath, nil)

	if err := ctrl.RunSmokeCheck(); err != nil {
		t.Fatalf("RunSmokeCheck returned error: %v", err)
	}
}

// TestBuildServiceGraph_CharacterizesActivationWiring asserts that the service
// graph constructed by the app contains the expected non-nil services with the
// expected concrete types.
func TestBuildServiceGraph_CharacterizesActivationWiring(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "recordings.db")
	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("create test database: %v", err)
	}
	defer database.Close()

	recordingSvc, thumbnailSvc, settingsSvc, aiFactory := buildServiceGraph(database)

	if recordingSvc == nil {
		t.Fatal("expected non-nil recording service")
	}
	if _, ok := any(recordingSvc).(*db.RecordingService); !ok {
		t.Fatalf("recording service type = %T, want *db.RecordingService", recordingSvc)
	}

	if thumbnailSvc == nil {
		t.Fatal("expected non-nil thumbnail service")
	}
	if _, ok := any(thumbnailSvc).(*thumbnail.Service); !ok {
		t.Fatalf("thumbnail service type = %T, want *thumbnail.Service", thumbnailSvc)
	}

	if settingsSvc == nil {
		t.Fatal("expected non-nil settings service")
	}
	if _, ok := any(settingsSvc).(*settings.Service); !ok {
		t.Fatalf("settings service type = %T, want *settings.Service", settingsSvc)
	}

	if aiFactory == nil {
		t.Fatal("expected non-nil AI factory")
	}
	if _, ok := any(aiFactory).(*ai.Factory); !ok {
		t.Fatalf("AI factory type = %T, want *ai.Factory", aiFactory)
	}

	thumbnailSvc.Close()
}

func TestPresetRepositoryAdapter_SatisfiesUIPresetModels(t *testing.T) {
	var _ ui.PresetListModel = (*presetRepositoryAdapter)(nil)
	var _ ui.PresetManagementModel = (*presetRepositoryAdapter)(nil)
}

func TestPresetRepositoryAdapter_UsesRealRepository(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "recordings.db")
	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("create test database: %v", err)
	}
	defer database.Close()

	adapter := newPresetRepositoryAdapter(database)
	if adapter == nil {
		t.Fatal("newPresetRepositoryAdapter returned nil")
	}

	if err := database.PresetRepo().SeedBuiltins(); err != nil {
		t.Fatalf("SeedBuiltins error = %v", err)
	}

	if err := adapter.SaveCustomPreset(context.Background(), &db.Preset{
		Name:       "Adapter Custom",
		Container:  db.PresetContainerMP4,
		VideoCodec: "h264",
		AudioCodec: "aac",
		Bitrate:    1_000_000,
		Width:      1280,
		Height:     720,
		IsBuiltin:  true,
	}); err != nil {
		t.Fatalf("SaveCustomPreset error = %v", err)
	}

	created, err := database.PresetRepo().GetByName("Adapter Custom")
	if err != nil {
		t.Fatalf("GetByName(Adapter Custom) error = %v", err)
	}
	if created.IsBuiltin {
		t.Fatal("SaveCustomPreset stored IsBuiltin=true, want forced custom preset")
	}

	created.Name = "Adapter Custom Renamed"
	if err := adapter.UpdatePreset(context.Background(), created); err != nil {
		t.Fatalf("UpdatePreset error = %v", err)
	}
	if _, err := database.PresetRepo().GetByName("Adapter Custom Renamed"); err != nil {
		t.Fatalf("renamed preset not found: %v", err)
	}

	presets, err := adapter.ListPresets(context.Background())
	if err != nil {
		t.Fatalf("ListPresets error = %v", err)
	}
	if len(presets) < 5 {
		t.Fatalf("ListPresets returned %d presets, want seeded built-ins plus custom", len(presets))
	}

	if err := adapter.DeletePreset(context.Background(), created.ID); err != nil {
		t.Fatalf("DeletePreset error = %v", err)
	}
	if _, err := database.PresetRepo().GetByID(created.ID); err == nil {
		t.Fatal("GetByID after DeletePreset succeeded, want deleted preset missing")
	}
}
