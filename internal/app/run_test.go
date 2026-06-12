package app

import (
	"path/filepath"
	"testing"

	"verbal/internal/ai"
	"verbal/internal/db"
	"verbal/internal/settings"
	"verbal/internal/thumbnail"
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
