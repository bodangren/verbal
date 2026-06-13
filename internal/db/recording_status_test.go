package db

import (
	"path/filepath"
	"testing"
	"time"
)

// Tests for RecordingStatus, ValidateRecordingStatus, ValidRecordingStatuses,
// and RecordingRepository.ListByStatus (spec FR2, test-strategy §5).
// Production code lives in recording_status.go and repository.go.

func TestRecordingStatus_IsValid(t *testing.T) {
	cases := []struct {
		name   string
		status RecordingStatus
		want   bool
	}{
		{"pending", StatusPending, true},
		{"in_progress", StatusInProgress, true},
		{"completed", StatusCompleted, true},
		{"error", StatusError, true},
		{"empty", RecordingStatus(""), false},
		{"unknown", RecordingStatus("bogus"), false},
		{"mixed_case", RecordingStatus("Pending"), false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.status.IsValid(); got != tc.want {
				t.Errorf("RecordingStatus(%q).IsValid() = %v, want %v", tc.status, got, tc.want)
			}
		})
	}
}

func TestRecordingStatus_StringConstants(t *testing.T) {
	cases := []struct {
		got  RecordingStatus
		want string
	}{
		{StatusPending, "pending"},
		{StatusInProgress, "in_progress"},
		{StatusCompleted, "completed"},
		{StatusError, "error"},
	}

	for _, tc := range cases {
		if string(tc.got) != tc.want {
			t.Errorf("constant value = %q, want %q", string(tc.got), tc.want)
		}
	}
}

func TestValidateRecordingStatus(t *testing.T) {
	if err := ValidateRecordingStatus("pending"); err != nil {
		t.Errorf("ValidateRecordingStatus(\"pending\") returned error: %v", err)
	}
	if err := ValidateRecordingStatus("completed"); err != nil {
		t.Errorf("ValidateRecordingStatus(\"completed\") returned error: %v", err)
	}
	if err := ValidateRecordingStatus("bogus"); err == nil {
		t.Errorf("ValidateRecordingStatus(\"bogus\") returned nil, want error")
	}
	if err := ValidateRecordingStatus(""); err == nil {
		t.Errorf("ValidateRecordingStatus(\"\") returned nil, want error")
	}
}

func TestValidRecordingStatuses_ContainsAll(t *testing.T) {
	got := ValidRecordingStatuses()
	want := map[RecordingStatus]bool{
		StatusPending:    false,
		StatusInProgress: false,
		StatusCompleted:  false,
		StatusError:      false,
	}
	for _, s := range got {
		if _, ok := want[s]; ok {
			want[s] = true
		}
	}
	for s, seen := range want {
		if !seen {
			t.Errorf("ValidRecordingStatuses() missing %q", s)
		}
	}
	if len(got) != len(want) {
		t.Errorf("ValidRecordingStatuses() returned %d entries, want %d", len(got), len(want))
	}
}

func TestRecordingRepository_ListByStatus(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	fixtures := []struct {
		path   string
		status string
	}{
		{"/path/a.mp4", string(StatusPending)},
		{"/path/b.mp4", string(StatusCompleted)},
		{"/path/c.mp4", string(StatusCompleted)},
		{"/path/d.mp4", string(StatusInProgress)},
		{"/path/e.mp4", string(StatusError)},
	}
	for _, f := range fixtures {
		rec := &Recording{
			FilePath:            f.path,
			Duration:            60 * time.Second,
			TranscriptionStatus: f.status,
		}
		if err := repo.Insert(rec); err != nil {
			t.Fatalf("Insert(%q): %v", f.path, err)
		}
	}

	completed, err := repo.ListByStatus(StatusCompleted)
	if err != nil {
		t.Fatalf("ListByStatus(StatusCompleted) error = %v", err)
	}
	if len(completed) != 2 {
		t.Errorf("ListByStatus(StatusCompleted) = %d recordings, want 2", len(completed))
	}
	for _, rec := range completed {
		if rec.TranscriptionStatus != string(StatusCompleted) {
			t.Errorf("ListByStatus returned recording with status %q, want %q", rec.TranscriptionStatus, StatusCompleted)
		}
	}

	pending, err := repo.ListByStatus(StatusPending)
	if err != nil {
		t.Fatalf("ListByStatus(StatusPending) error = %v", err)
	}
	if len(pending) != 1 {
		t.Errorf("ListByStatus(StatusPending) = %d recordings, want 1", len(pending))
	}

	errored, err := repo.ListByStatus(StatusError)
	if err != nil {
		t.Fatalf("ListByStatus(StatusError) error = %v", err)
	}
	if len(errored) != 1 {
		t.Errorf("ListByStatus(StatusError) = %d recordings, want 1", len(errored))
	}
}

func TestRecordingRepository_ListByStatus_OrderByCreatedAtDesc(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	for i := 0; i < 3; i++ {
		rec := &Recording{
			FilePath:            filepath.Join(tmpDir, "rec"+string(rune('a'+i))+".mp4"),
			Duration:            time.Duration(i+1) * time.Minute,
			TranscriptionStatus: string(StatusCompleted),
		}
		if err := repo.Insert(rec); err != nil {
			t.Fatalf("Insert(): %v", err)
		}
	}

	results, err := repo.ListByStatus(StatusCompleted)
	if err != nil {
		t.Fatalf("ListByStatus error = %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("ListByStatus = %d recordings, want 3", len(results))
	}
	if results[0].ID < results[1].ID || results[1].ID < results[2].ID {
		t.Errorf("ListByStatus(StatusCompleted) not ordered by created_at DESC: IDs=[%d %d %d]",
			results[0].ID, results[1].ID, results[2].ID)
	}
}

func TestRecordingRepository_ListByStatus_RejectsInvalidStatus(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	if _, err := repo.ListByStatus(RecordingStatus("bogus")); err == nil {
		t.Error("ListByStatus(\"bogus\") returned nil error, want validation error")
	}
}

func TestRecordingRepository_ListByStatus_EmptyResult(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	results, err := repo.ListByStatus(StatusCompleted)
	if err != nil {
		t.Fatalf("ListByStatus on empty table error = %v", err)
	}
	if len(results) != 0 {
		t.Errorf("ListByStatus on empty table = %d recordings, want 0", len(results))
	}
}
