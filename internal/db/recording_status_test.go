package db

import (
	"path/filepath"
	"testing"
	"time"
)

// Red-phase contract test for the Phase 1 ↔ Phase 2 status badge
// (spec FR2) and the typed status-filter API (RecordingStatus,
// IsValid, ValidateRecordingStatus, ValidRecordingStatuses,
// RecordingRepository.ListByStatus).
//
// Per test-strategy §8, this test is committed in the Red phase
// (this attempt). The production code (internal/db/recording_status.go
// and the new method on RecordingRepository) is deferred to a later
// Green-phase attempt. Each test is therefore guarded with t.Skip so
// the rest of the internal/db suite keeps passing on this branch.
//
// STUBS in this file (below the tests, marked with "STUB:") let the
// test file compile against the *shape* of the API the Green phase
// will produce. When flipping the Red task to [x] in plan.md, the
// next attempt must:
//   1. delete every STUB block in this file,
//   2. remove every t.Skip guard in this file,
//   3. add the real implementation in internal/db/recording_status.go
//      and a new method on *RecordingRepository.
// All three changes land in the same commit (workflow §3-4 + §8).

// -- Tests (all currently skipped per test-strategy §8) ---------------

func TestRecordingStatus_IsValid(t *testing.T) {
	t.Skip("track mvp_library_export_20260612 phase 1 task in progress")
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
	t.Skip("track mvp_library_export_20260612 phase 1 task in progress")
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
	t.Skip("track mvp_library_export_20260612 phase 1 task in progress")
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
	t.Skip("track mvp_library_export_20260612 phase 1 task in progress")
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
	t.Skip("track mvp_library_export_20260612 phase 1 task in progress")
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
	t.Skip("track mvp_library_export_20260612 phase 1 task in progress")
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
	t.Skip("track mvp_library_export_20260612 phase 1 task in progress")
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
	t.Skip("track mvp_library_export_20260612 phase 1 task in progress")
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

// -- STUBS (REMOVE on Green) -----------------------------------------
//
// The following declarations exist only to let this test file compile
// during the Red phase. They are intentionally no-op / wrong; the
// Green-phase attempt must delete this entire block and add the real
// implementation in internal/db/recording_status.go + the new method
// on *RecordingRepository.

// STUB: type removed in Green; real definition goes in
// internal/db/recording_status.go
type RecordingStatus string

// STUB: constants removed in Green; real definitions go in
// internal/db/recording_status.go
const (
	StatusPending    RecordingStatus = "pending"
	StatusInProgress RecordingStatus = "in_progress"
	StatusCompleted  RecordingStatus = "completed"
	StatusError      RecordingStatus = "error"
)

// STUB: IsValid removed in Green; real definition goes in
// internal/db/recording_status.go
func (s RecordingStatus) IsValid() bool { return false }

// STUB: ValidRecordingStatuses removed in Green; real definition goes in
// internal/db/recording_status.go
func ValidRecordingStatuses() []RecordingStatus { return nil }

// STUB: ValidateRecordingStatus removed in Green; real definition goes in
// internal/db/recording_status.go
func ValidateRecordingStatus(s string) error { return nil }

// STUB: ListByStatus method removed in Green; the real definition goes
// in internal/db/repository.go. The Green-phase author must delete this
// stub before adding the real method (otherwise Go's duplicate-method
// check will fail to compile).
func (r *RecordingRepository) ListByStatus(RecordingStatus) ([]*Recording, error) {
	return nil, nil
}
