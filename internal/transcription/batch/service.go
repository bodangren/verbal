package batch

import (
	"context"
	"encoding/json"

	"verbal/internal/ai"
	"verbal/internal/db"
)

// ProgressEvent is emitted during batch processing to report item-level
// status changes. Status mirrors the batch queue status constants
// (pending/processing/completed/error/cancelled).
type ProgressEvent struct {
	ItemID   int64
	FilePath string
	Status   string
	Progress float64
	Err      error
}

// ProgressCallback receives ProgressEvents during a Run.
type ProgressCallback func(ProgressEvent)

// TranscriptionRunner is the seam through which the batch service invokes
// per-file transcription. Production: *transcription.Service.
type TranscriptionRunner interface {
	TranscribeFile(ctx context.Context, path string) (*ai.TranscriptionResult, error)
}

// LibraryWriter is the seam through which successful transcription results
// are committed to the recording library. Production: *db.RecordingService.
type LibraryWriter interface {
	GetByPath(filePath string) (*db.Recording, error)
	UpdateTranscriptionStatus(id int64, status, transcriptionJSON string) error
}

// Service drains the batch transcription queue sequentially, invoking the
// runner for each item and persisting results through the library writer.
type Service struct {
	queue  *db.BatchQueueRepository
	runner TranscriptionRunner
	lib    LibraryWriter
	onProg ProgressCallback
}

// NewService creates a batch transcription service wired to the given
// queue, runner, and library.
func NewService(queue *db.BatchQueueRepository, runner TranscriptionRunner, lib LibraryWriter) *Service {
	return &Service{
		queue:  queue,
		runner: runner,
		lib:    lib,
	}
}

// SetProgressCallback registers a callback that receives ProgressEvents
// during Run.
func (s *Service) SetProgressCallback(cb ProgressCallback) {
	s.onProg = cb
}

// Run drains the batch queue until empty. It reconciles any rows stuck in
// "processing" (from a prior crash) back to "pending" first, then
// processes items sequentially in FIFO order.
//
// Per-item lifecycle:
//  1. Dequeue atomically transitions pending → processing.
//  2. A "processing" ProgressEvent is emitted.
//  3. runner.TranscribeFile is invoked.
//  4. On success the item is marked "completed", the transcription JSON
//     is committed via lib, and a "completed" ProgressEvent is emitted.
//  5. On error the item is marked "error" and a "error" ProgressEvent is
//     emitted; the queue continues with the next item.
//  6. On ctx cancellation the in-flight item is marked "cancelled", Run
//     returns ctx.Err(), and no further items are processed.
func (s *Service) Run(ctx context.Context) error {
	if _, err := s.queue.ReconcileProcessingToPending(); err != nil {
		return err
	}

	for {
		item, err := s.queue.Dequeue(ctx)
		if err != nil {
			return err
		}
		if item == nil {
			return nil
		}

		s.emit(ProgressEvent{
			ItemID:   item.ID,
			FilePath: item.FilePath,
			Status:   db.BatchQueueStatusProcessing,
			Progress: 0,
		})

		result, transErr := s.runner.TranscribeFile(ctx, item.FilePath)

		if ctx.Err() != nil {
			_ = s.queue.UpdateStatus(item.ID, db.BatchQueueStatusCancelled, 0)
			s.emit(ProgressEvent{
				ItemID:   item.ID,
				FilePath: item.FilePath,
				Status:   db.BatchQueueStatusCancelled,
				Progress: 0,
				Err:      ctx.Err(),
			})
			return ctx.Err()
		}

		if transErr != nil {
			_ = s.queue.UpdateStatus(item.ID, db.BatchQueueStatusError, 0)
			s.emit(ProgressEvent{
				ItemID:   item.ID,
				FilePath: item.FilePath,
				Status:   db.BatchQueueStatusError,
				Progress: 0,
				Err:      transErr,
			})
			continue
		}

		if err := s.queue.UpdateStatus(item.ID, db.BatchQueueStatusCompleted, 1.0); err != nil {
			return err
		}

		if err := s.commitToLibrary(item.FilePath, result); err != nil {
			return err
		}

		s.emit(ProgressEvent{
			ItemID:   item.ID,
			FilePath: item.FilePath,
			Status:   db.BatchQueueStatusCompleted,
			Progress: 1.0,
		})
	}
}

func (s *Service) commitToLibrary(filePath string, result *ai.TranscriptionResult) error {
	rec, err := s.lib.GetByPath(filePath)
	if err != nil {
		return err
	}

	payload, err := json.Marshal(result)
	if err != nil {
		return err
	}

	return s.lib.UpdateTranscriptionStatus(rec.ID, db.BatchQueueStatusCompleted, string(payload))
}

func (s *Service) emit(ev ProgressEvent) {
	if s.onProg != nil {
		s.onProg(ev)
	}
}
