package app

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"verbal/internal/db"
	"verbal/internal/media"
)

// Phase 4 Red contract (test-strategy §5 P4, §6, §7): the controller must
// route export and delete intents to its services. The Green phase will add
// (*Controller).ExportRecording and (*Controller).DeleteRecording in a new
// production file; this test file documents the contract and provides a
// bounded smoke test (TestSmoke_ControllerExportLive) that MUST fail during
// Red and pass during Green.
//
// Layout:
//   - fakeExporter / fakeDeleter (routing test doubles).
//   - mediaExporterAdapter (bridges *media.Exporter to the Exporter
//     interface; *media.Exporter.Export uses the unexported
//     media.progressFunc type, so direct interface satisfaction is not
//     possible).
//   - Routing tests.
//   - Live gates: TestSmoke_ControllerExportLive plus
//     two delete observable-behavior tests.

// fakeExporter records the arguments passed to Export and returns a
// pre-canned error.
type fakeExporter struct {
	callCount    int
	lastCtx      context.Context
	lastSrcPath  string
	lastDestPath string
	lastProgress func(float64, string)
	returnErr    error
}

func (f *fakeExporter) Export(ctx context.Context, srcPath, destPath string, progress func(float64, string)) error {
	f.callCount++
	f.lastCtx = ctx
	f.lastSrcPath = srcPath
	f.lastDestPath = destPath
	f.lastProgress = progress
	return f.returnErr
}

// fakeDeleter records the arguments passed to Delete and returns a
// pre-canned error.
type fakeDeleter struct {
	callCount int
	lastID    int64
	returnErr error
}

func (f *fakeDeleter) Delete(id int64) error {
	f.callCount++
	f.lastID = id
	return f.returnErr
}

// mediaExporterAdapter wraps *media.Exporter to satisfy the Exporter
// interface. The progress parameter is implicitly converted from
// func(float64, string) to media.progressFunc at the call site (same
// underlying type, per Go assignability rules).
type mediaExporterAdapter struct {
	inner *media.Exporter
}

func (a *mediaExporterAdapter) Export(ctx context.Context, srcPath, destPath string, progress func(float64, string)) error {
	return a.inner.Export(ctx, srcPath, destPath, progress)
}

// noopExporter satisfies Exporter by doing nothing. Used by the delete
// observable-behavior tests that do not exercise the export path.
type noopExporter struct{}

func (noopExporter) Export(ctx context.Context, srcPath, destPath string, progress func(float64, string)) error {
	return nil
}

// newTestControllerWithDeps constructs a Controller wired with a real DB
// and the given dependency doubles. The real injection mechanism (a field
// + With* setter on *Controller) is the Green phase's responsibility; this
// helper is intentionally minimal and lives in the test file.
func newTestControllerWithDeps(t *testing.T, exporter Exporter, deleter RecordingDeleter) (*Controller, *db.Database) {
	t.Helper()
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	ctrl := New(dbPath, nil)
	if err := ctrl.Initialize(); err != nil {
		t.Fatalf("Initialize: %v", err)
	}
	ctrl.WithExporter(exporter).WithRecordingDeleter(deleter)
	return ctrl, database
}

// makeTestRecording inserts a recording with the given file path and
// returns it. The duration is a fixed 5s; status is "pending" to match
// the service-layer default in service.go.
func makeTestRecording(t *testing.T, database *db.Database, filePath string) *db.Recording {
	t.Helper()
	rec := &db.Recording{
		FilePath:            filePath,
		Duration:            5 * time.Second,
		TranscriptionStatus: "pending",
	}
	if err := database.RecordingRepo().Insert(rec); err != nil {
		t.Fatalf("Insert recording: %v", err)
	}
	return rec
}

// --- Routing tests (t.Skip-guarded per test-strategy §8) ---

func TestController_ExportRecording_RoutesToExporter(t *testing.T) {
	tmpDir := t.TempDir()
	srcPath := filepath.Join(tmpDir, "src.mp4")
	if err := os.WriteFile(srcPath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("WriteFile src: %v", err)
	}

	fakeExp := &fakeExporter{}
	fakeDel := &fakeDeleter{}
	ctrl, database := newTestControllerWithDeps(t, fakeExp, fakeDel)
	rec := makeTestRecording(t, database, srcPath)

	destPath := filepath.Join(tmpDir, "dest.mp4")
	if err := ctrl.ExportRecording(context.Background(), rec.ID, destPath, nil); err != nil {
		t.Fatalf("ExportRecording returned error: %v", err)
	}
	if fakeExp.callCount != 1 {
		t.Errorf("exporter.Export call count = %d, want 1", fakeExp.callCount)
	}
}

func TestController_ExportRecording_PassesSrcPathFromRecording(t *testing.T) {
	tmpDir := t.TempDir()
	srcPath := filepath.Join(tmpDir, "my-video.mp4")
	if err := os.WriteFile(srcPath, []byte("data"), 0o644); err != nil {
		t.Fatalf("WriteFile src: %v", err)
	}

	fakeExp := &fakeExporter{}
	fakeDel := &fakeDeleter{}
	ctrl, database := newTestControllerWithDeps(t, fakeExp, fakeDel)
	rec := makeTestRecording(t, database, srcPath)

	destPath := filepath.Join(tmpDir, "out.mp4")
	if err := ctrl.ExportRecording(context.Background(), rec.ID, destPath, nil); err != nil {
		t.Fatalf("ExportRecording: %v", err)
	}
	if fakeExp.lastSrcPath != srcPath {
		t.Errorf("exporter lastSrcPath = %q, want %q", fakeExp.lastSrcPath, srcPath)
	}
}

func TestController_ExportRecording_PassesDestPathThrough(t *testing.T) {
	tmpDir := t.TempDir()
	srcPath := filepath.Join(tmpDir, "src.mp4")
	if err := os.WriteFile(srcPath, []byte("data"), 0o644); err != nil {
		t.Fatalf("WriteFile src: %v", err)
	}

	fakeExp := &fakeExporter{}
	fakeDel := &fakeDeleter{}
	ctrl, database := newTestControllerWithDeps(t, fakeExp, fakeDel)
	rec := makeTestRecording(t, database, srcPath)

	destPath := filepath.Join(tmpDir, "custom-dest.mp4")
	if err := ctrl.ExportRecording(context.Background(), rec.ID, destPath, nil); err != nil {
		t.Fatalf("ExportRecording: %v", err)
	}
	if fakeExp.lastDestPath != destPath {
		t.Errorf("exporter lastDestPath = %q, want %q", fakeExp.lastDestPath, destPath)
	}
}

func TestController_ExportRecording_PropagatesExporterError(t *testing.T) {
	tmpDir := t.TempDir()
	srcPath := filepath.Join(tmpDir, "src.mp4")
	if err := os.WriteFile(srcPath, []byte("data"), 0o644); err != nil {
		t.Fatalf("WriteFile src: %v", err)
	}

	sentinel := errors.New("exporter boom")
	fakeExp := &fakeExporter{returnErr: sentinel}
	fakeDel := &fakeDeleter{}
	ctrl, database := newTestControllerWithDeps(t, fakeExp, fakeDel)
	rec := makeTestRecording(t, database, srcPath)

	destPath := filepath.Join(tmpDir, "dest.mp4")
	err := ctrl.ExportRecording(context.Background(), rec.ID, destPath, nil)
	if !errors.Is(err, sentinel) {
		t.Errorf("ExportRecording error = %v, want wraps %v", err, sentinel)
	}
}

func TestController_ExportRecording_UnknownRecordingReturnsError(t *testing.T) {
	fakeExp := &fakeExporter{}
	fakeDel := &fakeDeleter{}
	ctrl, _ := newTestControllerWithDeps(t, fakeExp, fakeDel)

	// recID 99999 does not exist in the empty DB.
	err := ctrl.ExportRecording(context.Background(), 99999, "/tmp/dest.mp4", nil)
	if err == nil {
		t.Fatal("ExportRecording returned nil error for unknown recID, want error")
	}
	if fakeExp.callCount != 0 {
		t.Errorf("exporter.Export call count = %d, want 0 (recording lookup must fail first)", fakeExp.callCount)
	}
}

func TestController_DeleteRecording_RoutesToDeleter(t *testing.T) {
	fakeExp := &fakeExporter{}
	fakeDel := &fakeDeleter{}
	ctrl, database := newTestControllerWithDeps(t, fakeExp, fakeDel)
	rec := makeTestRecording(t, database, "/tmp/some-video.mp4")

	if err := ctrl.DeleteRecording(rec.ID, false); err != nil {
		t.Fatalf("DeleteRecording returned error: %v", err)
	}
	if fakeDel.callCount != 1 {
		t.Errorf("deleter.Delete call count = %d, want 1", fakeDel.callCount)
	}
	if fakeDel.lastID != rec.ID {
		t.Errorf("deleter lastID = %d, want %d", fakeDel.lastID, rec.ID)
	}
}

func TestController_DeleteRecording_PropagatesDeleterError(t *testing.T) {
	sentinel := errors.New("deleter boom")
	fakeExp := &fakeExporter{}
	fakeDel := &fakeDeleter{returnErr: sentinel}
	ctrl, database := newTestControllerWithDeps(t, fakeExp, fakeDel)
	rec := makeTestRecording(t, database, "/tmp/some-video.mp4")

	err := ctrl.DeleteRecording(rec.ID, false)
	if !errors.Is(err, sentinel) {
		t.Errorf("DeleteRecording error = %v, want wraps %v", err, sentinel)
	}
}

// --- Live gates (NOT t.Skip-guarded; must FAIL during Red) ---

// TestSmoke_ControllerExportLive constructs a real *media.Exporter and
// verifies that Controller.ExportRecording actually copies the source
// file to the destination. Per test-strategy §6, this is the bounded
// smoke test that prevents a fake from silently shadowing the real
// production path. The smoke test MUST start with TestSmoke_ and MUST NOT
// be excluded from `go test ./...`.
func TestSmoke_ControllerExportLive(t *testing.T) {
	tmpDir := t.TempDir()
	srcPath := filepath.Join(tmpDir, "src.bin")
	destPath := filepath.Join(tmpDir, "dest.bin")

	// 1 KiB payload with a recognizable pattern.
	payload := make([]byte, 1024)
	for i := range payload {
		payload[i] = byte(i % 256)
	}
	if err := os.WriteFile(srcPath, payload, 0o644); err != nil {
		t.Fatalf("WriteFile src: %v", err)
	}

	realAdapter := &mediaExporterAdapter{inner: media.NewExporter()}
	ctrl, database := newTestControllerWithDeps(t, realAdapter, &fakeDeleter{})
	rec := makeTestRecording(t, database, srcPath)

	if err := ctrl.ExportRecording(context.Background(), rec.ID, destPath, nil); err != nil {
		t.Fatalf("ExportRecording: %v", err)
	}

	got, err := os.ReadFile(destPath)
	if err != nil {
		t.Fatalf("ReadFile dest: %v", err)
	}
	if len(got) != len(payload) {
		t.Fatalf("dest file size = %d, want %d", len(got), len(payload))
	}
	for i := range got {
		if got[i] != payload[i] {
			t.Fatalf("dest byte %d = %d, want %d", i, got[i], payload[i])
		}
	}
}

// TestController_DeleteRecording_RemoveMediaFileTrue_RemovesBoth verifies
// that with removeMediaFile=true the controller removes both the DB row
// and the underlying media file from disk. This is an observable-behavior
// live gate: the STUB DeleteRecording returns nil without touching
// either, so the test MUST fail during Red and pass during Green.
func TestController_DeleteRecording_RemoveMediaFileTrue_RemovesBoth(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	mediaPath := filepath.Join(tmpDir, "video.mp4")

	if err := os.WriteFile(mediaPath, []byte("video-bytes"), 0o644); err != nil {
		t.Fatalf("WriteFile media: %v", err)
	}

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	ctrl := New(dbPath, nil)
	if err := ctrl.Initialize(); err != nil {
		t.Fatalf("Initialize: %v", err)
	}

	rec := makeTestRecording(t, database, mediaPath)

	if err := ctrl.DeleteRecording(rec.ID, true); err != nil {
		t.Fatalf("DeleteRecording: %v", err)
	}

	if _, err := database.RecordingRepo().GetByID(rec.ID); err == nil {
		t.Error("recording should be removed from DB after DeleteRecording(recID, true)")
	}
	if _, err := os.Stat(mediaPath); !os.IsNotExist(err) {
		t.Errorf("media file should be removed, stat error = %v", err)
	}
}

// TestController_DeleteRecording_RemoveMediaFileFalse_LeavesFile
// verifies that with removeMediaFile=false the controller removes the DB
// row but leaves the media file on disk. Observable-behavior live gate:
// the STUB does nothing, so the recording remains in the DB and the test
// MUST fail during Red.
func TestController_DeleteRecording_RemoveMediaFileFalse_LeavesFile(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	mediaPath := filepath.Join(tmpDir, "video.mp4")

	if err := os.WriteFile(mediaPath, []byte("video-bytes"), 0o644); err != nil {
		t.Fatalf("WriteFile media: %v", err)
	}

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	ctrl := New(dbPath, nil)
	if err := ctrl.Initialize(); err != nil {
		t.Fatalf("Initialize: %v", err)
	}

	rec := makeTestRecording(t, database, mediaPath)

	if err := ctrl.DeleteRecording(rec.ID, false); err != nil {
		t.Fatalf("DeleteRecording: %v", err)
	}

	if _, err := database.RecordingRepo().GetByID(rec.ID); err == nil {
		t.Error("recording should be removed from DB after DeleteRecording(recID, false)")
	}
	if _, err := os.Stat(mediaPath); err != nil {
		t.Errorf("media file should still exist after DeleteRecording(recID, false), stat error = %v", err)
	}
}
