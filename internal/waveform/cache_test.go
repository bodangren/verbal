package waveform

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func setupTestCache(t *testing.T) (*Cache, func()) {
	t.Helper()

	// Create temporary database
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}

	cache, err := NewCache(db)
	if err != nil {
		db.Close()
		t.Fatalf("Failed to create cache: %v", err)
	}

	cleanup := func() {
		db.Close()
	}

	return cache, cleanup
}

func TestNewCache(t *testing.T) {
	t.Run("valid database", func(t *testing.T) {
		tmpDir := t.TempDir()
		dbPath := filepath.Join(tmpDir, "test.db")

		db, err := sql.Open("sqlite", dbPath)
		if err != nil {
			t.Fatalf("Failed to open database: %v", err)
		}
		defer db.Close()

		cache, err := NewCache(db)
		if err != nil {
			t.Fatalf("NewCache failed: %v", err)
		}
		if cache == nil {
			t.Fatal("NewCache returned nil")
		}
	})

	t.Run("nil database", func(t *testing.T) {
		cache, err := NewCache(nil)
		if err == nil {
			t.Error("Expected error for nil database")
		}
		if cache != nil {
			t.Error("Expected nil cache for nil database")
		}
	})
}

func TestCache_SetAndGet(t *testing.T) {
	cache, cleanup := setupTestCache(t)
	defer cleanup()

	data := &Data{
		FilePath:   "/path/to/test.mp4",
		Duration:   60 * time.Second,
		SampleRate: 100,
		CreatedAt:  time.Now(),
		Samples: []Sample{
			{Time: 0, Amplitude: 0.1},
			{Time: 10 * time.Millisecond, Amplitude: 0.5},
			{Time: 20 * time.Millisecond, Amplitude: 0.9},
		},
	}

	// Set data
	if err := cache.Set(data); err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	// Get data
	retrieved, err := cache.Get(data.FilePath)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if retrieved == nil {
		t.Fatal("Get returned nil")
	}

	// Verify data
	if retrieved.FilePath != data.FilePath {
		t.Errorf("FilePath = %s, want %s", retrieved.FilePath, data.FilePath)
	}
	if retrieved.Duration != data.Duration {
		t.Errorf("Duration = %v, want %v", retrieved.Duration, data.Duration)
	}
	if retrieved.SampleRate != data.SampleRate {
		t.Errorf("SampleRate = %d, want %d", retrieved.SampleRate, data.SampleRate)
	}
	if len(retrieved.Samples) != len(data.Samples) {
		t.Errorf("Samples len = %d, want %d", len(retrieved.Samples), len(data.Samples))
	}

	// Verify samples
	for i, sample := range retrieved.Samples {
		expected := data.Samples[i]
		if sample.Time != expected.Time {
			t.Errorf("Sample[%d].Time = %v, want %v", i, sample.Time, expected.Time)
		}
		if abs(sample.Amplitude-expected.Amplitude) > 0.0001 {
			t.Errorf("Sample[%d].Amplitude = %f, want %f", i, sample.Amplitude, expected.Amplitude)
		}
	}
}

func TestCache_Get_NotFound(t *testing.T) {
	cache, cleanup := setupTestCache(t)
	defer cleanup()

	data, err := cache.Get("/nonexistent/file.mp4")
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if data != nil {
		t.Error("Expected nil for non-existent file")
	}
}

func TestCache_Set_UpdateExisting(t *testing.T) {
	cache, cleanup := setupTestCache(t)
	defer cleanup()

	filePath := "/path/to/test.mp4"

	// Set initial data
	data1 := &Data{
		FilePath:   filePath,
		Duration:   60 * time.Second,
		SampleRate: 100,
		CreatedAt:  time.Now(),
		Samples:    []Sample{{Time: 0, Amplitude: 0.1}},
	}
	if err := cache.Set(data1); err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	// Update with new data
	data2 := &Data{
		FilePath:   filePath,
		Duration:   120 * time.Second,
		SampleRate: 200,
		CreatedAt:  time.Now(),
		Samples:    []Sample{{Time: 0, Amplitude: 0.9}},
	}
	if err := cache.Set(data2); err != nil {
		t.Fatalf("Set (update) failed: %v", err)
	}

	// Verify updated data
	retrieved, err := cache.Get(filePath)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if retrieved.Duration != 120*time.Second {
		t.Errorf("Duration = %v, want %v", retrieved.Duration, 120*time.Second)
	}
	if retrieved.SampleRate != 200 {
		t.Errorf("SampleRate = %d, want 200", retrieved.SampleRate)
	}
	if len(retrieved.Samples) != 1 || retrieved.Samples[0].Amplitude != 0.9 {
		t.Error("Samples not updated correctly")
	}
}

func TestCache_Set_InvalidData(t *testing.T) {
	cache, cleanup := setupTestCache(t)
	defer cleanup()

	tests := []struct {
		name string
		data *Data
	}{
		{
			name: "nil data",
			data: nil,
		},
		{
			name: "empty file path",
			data: &Data{FilePath: ""},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := cache.Set(tt.data)
			if err == nil {
				t.Error("Expected error for invalid data")
			}
		})
	}
}

func TestCache_Delete(t *testing.T) {
	cache, cleanup := setupTestCache(t)
	defer cleanup()

	filePath := "/path/to/test.mp4"

	// Add data
	data := &Data{
		FilePath:   filePath,
		Duration:   60 * time.Second,
		SampleRate: 100,
		CreatedAt:  time.Now(),
		Samples:    []Sample{{Time: 0, Amplitude: 0.5}},
	}
	if err := cache.Set(data); err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	// Verify exists
	exists, err := cache.Exists(filePath)
	if err != nil {
		t.Fatalf("Exists failed: %v", err)
	}
	if !exists {
		t.Error("Expected data to exist")
	}

	// Delete
	if err := cache.Delete(filePath); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	// Verify deleted
	exists, err = cache.Exists(filePath)
	if err != nil {
		t.Fatalf("Exists after delete failed: %v", err)
	}
	if exists {
		t.Error("Expected data to be deleted")
	}
}

func TestCache_Exists(t *testing.T) {
	cache, cleanup := setupTestCache(t)
	defer cleanup()

	filePath := "/path/to/test.mp4"

	// Check before adding
	exists, err := cache.Exists(filePath)
	if err != nil {
		t.Fatalf("Exists failed: %v", err)
	}
	if exists {
		t.Error("Expected file to not exist")
	}

	// Add data
	data := &Data{
		FilePath:   filePath,
		Duration:   60 * time.Second,
		SampleRate: 100,
		CreatedAt:  time.Now(),
		Samples:    []Sample{{Time: 0, Amplitude: 0.5}},
	}
	if err := cache.Set(data); err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	// Check after adding
	exists, err = cache.Exists(filePath)
	if err != nil {
		t.Fatalf("Exists failed: %v", err)
	}
	if !exists {
		t.Error("Expected file to exist")
	}
}

func TestCache_Clear(t *testing.T) {
	cache, cleanup := setupTestCache(t)
	defer cleanup()

	// Add multiple entries
	for i := 0; i < 3; i++ {
		data := &Data{
			FilePath:   fmt.Sprintf("/path/to/test%d.mp4", i),
			Duration:   60 * time.Second,
			SampleRate: 100,
			CreatedAt:  time.Now(),
			Samples:    []Sample{{Time: 0, Amplitude: 0.5}},
		}
		if err := cache.Set(data); err != nil {
			t.Fatalf("Set failed: %v", err)
		}
	}

	// Clear
	if err := cache.Clear(); err != nil {
		t.Fatalf("Clear failed: %v", err)
	}

	// Verify all deleted
	count, _, err := cache.Stats()
	if err != nil {
		t.Fatalf("Stats failed: %v", err)
	}
	if count != 0 {
		t.Errorf("Expected 0 entries after clear, got %d", count)
	}
}

func TestCache_Stats(t *testing.T) {
	cache, cleanup := setupTestCache(t)
	defer cleanup()

	// Initial stats
	count, size, err := cache.Stats()
	if err != nil {
		t.Fatalf("Stats failed: %v", err)
	}
	if count != 0 {
		t.Errorf("Expected 0 entries, got %d", count)
	}
	if size != 0 {
		t.Errorf("Expected 0 size, got %d", size)
	}

	// Add entry
	data := &Data{
		FilePath:   "/path/to/test.mp4",
		Duration:   60 * time.Second,
		SampleRate: 100,
		CreatedAt:  time.Now(),
		Samples: []Sample{
			{Time: 0, Amplitude: 0.1},
			{Time: 10 * time.Millisecond, Amplitude: 0.5},
		},
	}
	if err := cache.Set(data); err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	// Stats after adding
	count, size, err = cache.Stats()
	if err != nil {
		t.Fatalf("Stats failed: %v", err)
	}
	if count != 1 {
		t.Errorf("Expected 1 entry, got %d", count)
	}
	if size <= 0 {
		t.Error("Expected positive size")
	}
}

func TestCache_GetOrGenerate_Cached(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available, skipping GStreamer test")
	}

	cache, cleanup := setupTestCache(t)
	defer cleanup()

	// Pre-populate cache
	filePath := "/path/to/test.mp4"
	data := &Data{
		FilePath:   filePath,
		Duration:   60 * time.Second,
		SampleRate: 100,
		CreatedAt:  time.Now(),
		Samples:    []Sample{{Time: 0, Amplitude: 0.5}},
	}
	if err := cache.Set(data); err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	// GetOrGenerate should return cached data
	progressCalled := false
	gen := NewGenerator(DefaultConfig())

	result, err := cache.GetOrGenerate(filePath, gen, func(p float64) {
		progressCalled = true
	})
	if err != nil {
		t.Fatalf("GetOrGenerate failed: %v", err)
	}

	if result == nil {
		t.Fatal("GetOrGenerate returned nil")
	}

	if result.FilePath != filePath {
		t.Errorf("FilePath = %s, want %s", result.FilePath, filePath)
	}

	if !progressCalled {
		t.Error("Progress callback should be called")
	}
}
