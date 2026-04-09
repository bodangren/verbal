package thumbnail

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"verbal/internal/db"
)

type fakeStore struct {
	mu    sync.Mutex
	saved map[int64]*Image
	err   error
}

func newFakeStore() *fakeStore {
	return &fakeStore{saved: make(map[int64]*Image)}
}

func (f *fakeStore) SaveThumbnail(recordingID int64, data, mimeType string, generatedAt time.Time) error {
	if f.err != nil {
		return f.err
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	f.saved[recordingID] = &Image{
		Base64Data:  data,
		MIMEType:    mimeType,
		GeneratedAt: generatedAt,
	}
	return nil
}

type fakeGenerator struct {
	mu        sync.Mutex
	responses map[string]generatorResponse
	calls     []string
}

type generatorResponse struct {
	image *Image
	err   error
}

func newFakeGenerator() *fakeGenerator {
	return &fakeGenerator{responses: make(map[string]generatorResponse)}
}

func (f *fakeGenerator) Generate(filePath string) (*Image, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, filePath)

	resp, ok := f.responses[filePath]
	if !ok {
		return &Image{Base64Data: "abc", MIMEType: "image/jpeg", GeneratedAt: time.Now().UTC()}, nil
	}
	return resp.image, resp.err
}

func TestService_NeedsGeneration(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "recording.mp4")
	if err := os.WriteFile(filePath, []byte("video"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	svc := NewService(newFakeStore(), newFakeGenerator(), ServiceConfig{Workers: 1, QueueSize: 4})
	defer svc.Close()

	recNoThumb := &db.Recording{ID: 1, FilePath: filePath}
	if !svc.NeedsGeneration(recNoThumb) {
		t.Fatal("Expected NeedsGeneration=true when thumbnail is missing")
	}

	now := time.Now().UTC()
	recFresh := &db.Recording{ID: 2, FilePath: filePath, ThumbnailData: "abc", ThumbnailGeneratedAt: &now}
	if svc.NeedsGeneration(recFresh) {
		t.Fatal("Expected NeedsGeneration=false for fresh thumbnail")
	}

	old := time.Now().Add(-2 * time.Hour).UTC()
	if err := os.Chtimes(filePath, time.Now(), time.Now()); err != nil {
		t.Fatalf("Chtimes() error = %v", err)
	}
	recStale := &db.Recording{ID: 3, FilePath: filePath, ThumbnailData: "abc", ThumbnailGeneratedAt: &old}
	if !svc.NeedsGeneration(recStale) {
		t.Fatal("Expected NeedsGeneration=true for stale thumbnail")
	}
}

func TestService_EnqueueBatch_GeneratesAndPersists(t *testing.T) {
	store := newFakeStore()
	generator := newFakeGenerator()
	svc := NewService(store, generator, ServiceConfig{Workers: 1, QueueSize: 8})
	defer svc.Close()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "recording.mp4")
	if err := os.WriteFile(filePath, []byte("video"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	rec := &db.Recording{ID: 10, FilePath: filePath}

	done := make(chan struct{}, 1)
	queued := svc.EnqueueBatch([]*db.Recording{rec}, func(recordingID int64, image *Image, err error) {
		if err != nil {
			t.Errorf("unexpected callback error: %v", err)
		}
		if image == nil {
			t.Error("expected non-nil generated image")
		}
		if recordingID != rec.ID {
			t.Errorf("expected callback ID %d, got %d", rec.ID, recordingID)
		}
		done <- struct{}{}
	})

	if queued != 1 {
		t.Fatalf("Expected exactly one queued recording, got %d", queued)
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Timed out waiting for thumbnail generation callback")
	}

	store.mu.Lock()
	_, ok := store.saved[rec.ID]
	store.mu.Unlock()
	if !ok {
		t.Fatal("Expected thumbnail payload to be persisted")
	}
}

func TestService_Enqueue_DeduplicatesInflightRequests(t *testing.T) {
	store := newFakeStore()
	generator := newFakeGenerator()
	generator.responses["/tmp/slow.mp4"] = generatorResponse{
		image: &Image{Base64Data: "abc", MIMEType: "image/jpeg", GeneratedAt: time.Now().UTC()},
	}

	svc := NewService(store, generator, ServiceConfig{Workers: 1, QueueSize: 8})
	defer svc.Close()

	rec := &db.Recording{ID: 42, FilePath: "/tmp/slow.mp4"}

	first := svc.Enqueue(rec, nil)
	second := svc.Enqueue(rec, nil)

	if !first {
		t.Fatal("Expected first enqueue to succeed")
	}
	if second {
		t.Fatal("Expected second enqueue to be rejected as duplicate")
	}
}

func TestService_PropagatesGeneratorError(t *testing.T) {
	store := newFakeStore()
	generator := newFakeGenerator()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "broken.mp4")
	if err := os.WriteFile(filePath, []byte("video"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	generator.responses[filePath] = generatorResponse{err: errors.New("decode failed")}

	svc := NewService(store, generator, ServiceConfig{Workers: 1, QueueSize: 4})
	defer svc.Close()

	rec := &db.Recording{ID: 99, FilePath: filePath}
	done := make(chan error, 1)

	if !svc.Enqueue(rec, func(_ int64, _ *Image, err error) {
		done <- err
	}) {
		t.Fatal("Expected enqueue to succeed")
	}

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("Expected error callback for failed generation")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Timed out waiting for error callback")
	}

	store.mu.Lock()
	_, saved := store.saved[rec.ID]
	store.mu.Unlock()
	if saved {
		t.Fatal("Did not expect failed generation to be saved")
	}
}
