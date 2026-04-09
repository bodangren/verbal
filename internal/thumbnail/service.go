package thumbnail

import (
	"os"
	"sync"
	"time"

	"verbal/internal/db"
)

// ThumbnailStore persists generated thumbnails.
type ThumbnailStore interface {
	SaveThumbnail(recordingID int64, data, mimeType string, generatedAt time.Time) error
}

// ThumbnailGenerator creates thumbnail payloads from files.
type ThumbnailGenerator interface {
	Generate(filePath string) (*Image, error)
}

// GenerationCallback receives completion events for background generation requests.
type GenerationCallback func(recordingID int64, image *Image, err error)

// ServiceConfig controls worker and queue sizing for the thumbnail service.
type ServiceConfig struct {
	Workers   int
	QueueSize int
}

// DefaultServiceConfig returns sensible defaults for background thumbnail generation.
func DefaultServiceConfig() ServiceConfig {
	return ServiceConfig{
		Workers:   2,
		QueueSize: 128,
	}
}

type generationRequest struct {
	recording db.Recording
	callback  GenerationCallback
}

// Service orchestrates queued, concurrent thumbnail generation.
type Service struct {
	store     ThumbnailStore
	generator ThumbnailGenerator

	queue chan generationRequest

	mu       sync.Mutex
	inFlight map[int64]struct{}

	wg sync.WaitGroup
}

// NewService creates and starts a background thumbnail generation service.
func NewService(store ThumbnailStore, generator ThumbnailGenerator, config ServiceConfig) *Service {
	cfg := normalizeServiceConfig(config)

	svc := &Service{
		store:     store,
		generator: generator,
		queue:     make(chan generationRequest, cfg.QueueSize),
		inFlight:  make(map[int64]struct{}),
	}

	for i := 0; i < cfg.Workers; i++ {
		svc.wg.Add(1)
		go svc.worker()
	}

	return svc
}

// Close drains and stops service workers.
func (s *Service) Close() {
	close(s.queue)
	s.wg.Wait()
}

// NeedsGeneration returns true when a recording has no thumbnail or stale thumbnail data.
func (s *Service) NeedsGeneration(recording *db.Recording) bool {
	if recording == nil || recording.ID <= 0 || recording.FilePath == "" {
		return false
	}
	if recording.ThumbnailData == "" || recording.ThumbnailGeneratedAt == nil {
		return true
	}

	info, err := os.Stat(recording.FilePath)
	if err != nil {
		// Missing files should not continuously enqueue failed work.
		return false
	}

	return info.ModTime().UTC().After(recording.ThumbnailGeneratedAt.UTC())
}

// Enqueue schedules a single recording for background generation.
// It returns true when the request was accepted.
func (s *Service) Enqueue(recording *db.Recording, callback GenerationCallback) bool {
	if !s.NeedsGeneration(recording) {
		return false
	}

	s.mu.Lock()
	if _, exists := s.inFlight[recording.ID]; exists {
		s.mu.Unlock()
		return false
	}
	s.inFlight[recording.ID] = struct{}{}
	s.mu.Unlock()

	req := generationRequest{recording: *recording, callback: callback}

	select {
	case s.queue <- req:
		return true
	default:
		s.mu.Lock()
		delete(s.inFlight, recording.ID)
		s.mu.Unlock()
		return false
	}
}

// EnqueueBatch schedules recordings in the provided order and returns accepted count.
func (s *Service) EnqueueBatch(recordings []*db.Recording, callback GenerationCallback) int {
	queued := 0
	for _, rec := range recordings {
		if s.Enqueue(rec, callback) {
			queued++
		}
	}
	return queued
}

func (s *Service) worker() {
	defer s.wg.Done()

	for req := range s.queue {
		recordingID := req.recording.ID

		image, err := s.generator.Generate(req.recording.FilePath)
		if err == nil && image != nil {
			err = s.store.SaveThumbnail(recordingID, image.Base64Data, image.MIMEType, image.GeneratedAt)
		}

		if req.callback != nil {
			req.callback(recordingID, image, err)
		}

		s.mu.Lock()
		delete(s.inFlight, recordingID)
		s.mu.Unlock()
	}
}

func normalizeServiceConfig(config ServiceConfig) ServiceConfig {
	cfg := config
	if cfg.Workers <= 0 {
		cfg.Workers = 2
	}
	if cfg.QueueSize < cfg.Workers {
		cfg.QueueSize = cfg.Workers * 4
	}
	return cfg
}
