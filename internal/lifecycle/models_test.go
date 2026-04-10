package lifecycle

import (
	"testing"
	"time"
)

func TestNewExportManifest(t *testing.T) {
	recording := &ExportedRecording{
		ID:        "rec-123",
		Title:     "Test Recording",
		CreatedAt: time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC),
		Duration:  60000,
		MediaFile: &ExportedFile{
			Filename: "test.mp4",
			Size:     1024000,
			Checksum: "abc123",
		},
	}

	manifest := NewExportManifest(recording)

	if manifest.Version != ExportFormatVersion {
		t.Errorf("expected version %s, got %s", ExportFormatVersion, manifest.Version)
	}
	if manifest.Recording != recording {
		t.Error("expected recording to be set")
	}
	if !manifest.ExportedAt.After(time.Now().Add(-time.Minute)) {
		t.Error("expected ExportedAt to be recent")
	}
}

func TestNewBulkExportManifest(t *testing.T) {
	recordings := []*ExportedRecording{
		{
			ID:        "rec-1",
			Title:     "Recording 1",
			CreatedAt: time.Now(),
			MediaFile: &ExportedFile{Filename: "1.mp4", Size: 100, Checksum: "a"},
		},
		{
			ID:        "rec-2",
			Title:     "Recording 2",
			CreatedAt: time.Now(),
			MediaFile: &ExportedFile{Filename: "2.mp4", Size: 200, Checksum: "b"},
		},
	}

	manifest := NewBulkExportManifest(recordings)

	if manifest.Version != ExportFormatVersion {
		t.Errorf("expected version %s, got %s", ExportFormatVersion, manifest.Version)
	}
	if len(manifest.Recordings) != 2 {
		t.Errorf("expected 2 recordings, got %d", len(manifest.Recordings))
	}
	if manifest.Recording != nil {
		t.Error("expected single recording to be nil for bulk export")
	}
}

func TestExportManifest_Validate(t *testing.T) {
	tests := []struct {
		name      string
		manifest  *ExportManifest
		wantError bool
		errMsg    string
	}{
		{
			name: "valid single recording",
			manifest: &ExportManifest{
				Version:    ExportFormatVersion,
				ExportedAt: time.Now(),
				Recording: &ExportedRecording{
					ID:        "rec-1",
					Title:     "Test",
					CreatedAt: time.Now(),
					MediaFile: &ExportedFile{Filename: "test.mp4", Size: 100, Checksum: "abc"},
				},
			},
			wantError: false,
		},
		{
			name: "valid bulk export",
			manifest: &ExportManifest{
				Version:    ExportFormatVersion,
				ExportedAt: time.Now(),
				Recordings: []*ExportedRecording{
					{ID: "rec-1", Title: "Test", CreatedAt: time.Now(), MediaFile: &ExportedFile{Filename: "test.mp4", Size: 100, Checksum: "abc"}},
				},
			},
			wantError: false,
		},
		{
			name:      "missing version",
			manifest:  &ExportManifest{ExportedAt: time.Now(), Recording: &ExportedRecording{}},
			wantError: true,
			errMsg:    "version is required",
		},
		{
			name:      "unsupported version",
			manifest:  &ExportManifest{Version: "2.0", ExportedAt: time.Now(), Recording: &ExportedRecording{}},
			wantError: true,
			errMsg:    "unsupported export version",
		},
		{
			name:      "missing exported_at",
			manifest:  &ExportManifest{Version: ExportFormatVersion, Recording: &ExportedRecording{}},
			wantError: true,
			errMsg:    "exported_at is required",
		},
		{
			name:      "no recordings",
			manifest:  &ExportManifest{Version: ExportFormatVersion, ExportedAt: time.Now()},
			wantError: true,
			errMsg:    "at least one recording is required",
		},
		{
			name: "invalid recording",
			manifest: &ExportManifest{
				Version:    ExportFormatVersion,
				ExportedAt: time.Now(),
				Recording:  &ExportedRecording{ID: "", Title: "", MediaFile: nil},
			},
			wantError: true,
			errMsg:    "id is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.manifest.Validate()
			if tt.wantError {
				if err == nil {
					t.Errorf("expected error containing %q, got nil", tt.errMsg)
				} else if tt.errMsg != "" && !contains(err.Error(), tt.errMsg) {
					t.Errorf("expected error containing %q, got %q", tt.errMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
			}
		})
	}
}

func TestExportedRecording_Validate(t *testing.T) {
	tests := []struct {
		name      string
		recording *ExportedRecording
		wantError bool
		errMsg    string
	}{
		{
			name: "valid minimal",
			recording: &ExportedRecording{
				ID:        "rec-1",
				Title:     "Test",
				CreatedAt: time.Now(),
				MediaFile: &ExportedFile{Filename: "test.mp4", Size: 100, Checksum: "abc"},
			},
			wantError: false,
		},
		{
			name: "valid with optional files",
			recording: &ExportedRecording{
				ID:            "rec-1",
				Title:         "Test",
				CreatedAt:     time.Now(),
				MediaFile:     &ExportedFile{Filename: "test.mp4", Size: 100, Checksum: "abc"},
				Transcription: &ExportedFile{Filename: "test.json", Size: 50, Checksum: "def"},
				Thumbnail:     &ExportedFile{Filename: "test.jpg", Size: 25, Checksum: "ghi"},
			},
			wantError: false,
		},
		{
			name:      "missing id",
			recording: &ExportedRecording{Title: "Test", MediaFile: &ExportedFile{Filename: "test.mp4", Size: 100, Checksum: "abc"}},
			wantError: true,
			errMsg:    "id is required",
		},
		{
			name:      "missing title",
			recording: &ExportedRecording{ID: "rec-1", MediaFile: &ExportedFile{Filename: "test.mp4", Size: 100, Checksum: "abc"}},
			wantError: true,
			errMsg:    "title is required",
		},
		{
			name:      "missing media file",
			recording: &ExportedRecording{ID: "rec-1", Title: "Test"},
			wantError: true,
			errMsg:    "media_file is required",
		},
		{
			name: "invalid media file",
			recording: &ExportedRecording{
				ID:        "rec-1",
				Title:     "Test",
				MediaFile: &ExportedFile{Filename: "", Size: -1, Checksum: ""},
			},
			wantError: true,
			errMsg:    "filename is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.recording.Validate()
			if tt.wantError {
				if err == nil {
					t.Errorf("expected error containing %q, got nil", tt.errMsg)
				} else if tt.errMsg != "" && !contains(err.Error(), tt.errMsg) {
					t.Errorf("expected error containing %q, got %q", tt.errMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
			}
		})
	}
}

func TestExportedFile_Validate(t *testing.T) {
	tests := []struct {
		name    string
		file    *ExportedFile
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid",
			file:    &ExportedFile{Filename: "test.mp4", Size: 100, Checksum: "abc123"},
			wantErr: false,
		},
		{
			name:    "missing filename",
			file:    &ExportedFile{Size: 100, Checksum: "abc"},
			wantErr: true,
			errMsg:  "filename is required",
		},
		{
			name:    "negative size",
			file:    &ExportedFile{Filename: "test.mp4", Size: -1, Checksum: "abc"},
			wantErr: true,
			errMsg:  "size_bytes cannot be negative",
		},
		{
			name:    "missing checksum",
			file:    &ExportedFile{Filename: "test.mp4", Size: 100},
			wantErr: true,
			errMsg:  "checksum_sha256 is required",
		},
		{
			name:    "zero size is valid",
			file:    &ExportedFile{Filename: "test.mp4", Size: 0, Checksum: "abc"},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.file.Validate()
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error containing %q, got nil", tt.errMsg)
				} else if tt.errMsg != "" && !contains(err.Error(), tt.errMsg) {
					t.Errorf("expected error containing %q, got %q", tt.errMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
			}
		})
	}
}

func TestSerializeDeserialize(t *testing.T) {
	original := NewExportManifest(&ExportedRecording{
		ID:          "rec-123",
		Title:       "Test Recording",
		Description: "A test recording",
		CreatedAt:   time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC),
		Duration:    60000,
		MediaFile: &ExportedFile{
			Filename: "test.mp4",
			Size:     1024000,
			Checksum: "sha256checksum",
		},
		Transcription: &ExportedFile{
			Filename: "test.json",
			Size:     5000,
			Checksum: "txchecksum",
		},
	})

	data, err := original.Serialize()
	if err != nil {
		t.Fatalf("serialize failed: %v", err)
	}

	// Verify it's valid JSON
	if len(data) == 0 {
		t.Error("serialized data is empty")
	}

	// Deserialize and verify
	deserialized, err := DeserializeManifest(data)
	if err != nil {
		t.Fatalf("deserialize failed: %v", err)
	}

	if deserialized.Version != original.Version {
		t.Errorf("version mismatch: got %s, want %s", deserialized.Version, original.Version)
	}
	if deserialized.Recording.ID != original.Recording.ID {
		t.Errorf("recording ID mismatch: got %s, want %s", deserialized.Recording.ID, original.Recording.ID)
	}
	if deserialized.Recording.Title != original.Recording.Title {
		t.Errorf("title mismatch: got %s, want %s", deserialized.Recording.Title, original.Recording.Title)
	}
	if !deserialized.ExportedAt.Equal(original.ExportedAt) {
		t.Errorf("exported_at mismatch: got %v, want %v", deserialized.ExportedAt, original.ExportedAt)
	}
}

func TestDeserializeManifest_InvalidJSON(t *testing.T) {
	_, err := DeserializeManifest([]byte("not valid json"))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestCalculateChecksum(t *testing.T) {
	data := []byte("hello world")
	checksum := CalculateChecksum(data)

	// SHA-256 of "hello world" is known
	expected := "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
	if checksum != expected {
		t.Errorf("checksum mismatch: got %s, want %s", checksum, expected)
	}
}

func TestCalculateChecksumFromString(t *testing.T) {
	checksum := CalculateChecksumFromString("test")
	expected := CalculateChecksum([]byte("test"))
	if checksum != expected {
		t.Errorf("checksum mismatch: got %s, want %s", checksum, expected)
	}
}

// Helper function
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
