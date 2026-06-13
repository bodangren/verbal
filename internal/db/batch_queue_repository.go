package db

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// Batch queue status constants.
const (
	BatchQueueStatusPending    = "pending"
	BatchQueueStatusProcessing = "processing"
	BatchQueueStatusCompleted  = "completed"
	BatchQueueStatusError      = "error"
	BatchQueueStatusCancelled  = "cancelled"
)

// validTransitions defines the allowed status transitions for UpdateStatus.
var validTransitions = map[string]map[string]bool{
	BatchQueueStatusPending: {
		BatchQueueStatusProcessing: true,
		BatchQueueStatusCancelled:  true,
	},
	BatchQueueStatusProcessing: {
		BatchQueueStatusCompleted: true,
		BatchQueueStatusError:     true,
		BatchQueueStatusCancelled: true,
	},
}

// BatchQueueItem represents a single entry in the transcription batch queue.
type BatchQueueItem struct {
	ID          int64
	FilePath    string
	Status      string
	Progress    float64
	CreatedAt   time.Time
	StartedAt   *time.Time
	CompletedAt *time.Time
}

// BatchQueueRepository provides CRUD operations for the batch transcription queue.
type BatchQueueRepository struct {
	db *sql.DB
}

// batchQueueColumns is the standard SELECT column list for batch_queue queries.
const batchQueueColumns = `id, file_path, status, progress, created_at, started_at, completed_at`

// scanBatchQueueItem scans a single row into a BatchQueueItem struct.
func scanBatchQueueItem(s scanner) (*BatchQueueItem, error) {
	item := &BatchQueueItem{}
	var createdAt string
	var startedAt sql.NullString
	var completedAt sql.NullString

	err := s.Scan(
		&item.ID,
		&item.FilePath,
		&item.Status,
		&item.Progress,
		&createdAt,
		&startedAt,
		&completedAt,
	)
	if err != nil {
		return nil, err
	}

	if createdAt != "" {
		item.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	}
	if startedAt.Valid && startedAt.String != "" {
		t, _ := time.Parse(time.RFC3339, startedAt.String)
		item.StartedAt = &t
	}
	if completedAt.Valid && completedAt.String != "" {
		t, _ := time.Parse(time.RFC3339, completedAt.String)
		item.CompletedAt = &t
	}

	return item, nil
}

// Enqueue adds a new item to the batch queue in pending status.
// It rejects file paths containing embedded newline characters.
func (r *BatchQueueRepository) Enqueue(filePath string) (*BatchQueueItem, error) {
	if strings.ContainsAny(filePath, "\n\r") {
		return nil, fmt.Errorf("enqueue: file path contains embedded control character")
	}

	now := time.Now().UTC()
	result, err := r.db.Exec(`
		INSERT INTO batch_queue (file_path, status, progress, created_at)
		VALUES (?, ?, ?, ?)
	`, filePath, BatchQueueStatusPending, 0, now.Format(time.RFC3339))
	if err != nil {
		return nil, fmt.Errorf("enqueue: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("enqueue: get last insert id: %w", err)
	}

	return &BatchQueueItem{
		ID:        id,
		FilePath:  filePath,
		Status:    BatchQueueStatusPending,
		Progress:  0,
		CreatedAt: now,
	}, nil
}

// ListPending returns all pending items in FIFO order (by id).
func (r *BatchQueueRepository) ListPending() ([]*BatchQueueItem, error) {
	rows, err := r.db.Query(`
		SELECT `+batchQueueColumns+`
		FROM batch_queue
		WHERE status = ?
		ORDER BY id ASC
	`, BatchQueueStatusPending)
	if err != nil {
		return nil, fmt.Errorf("list pending: %w", err)
	}
	defer rows.Close()

	var items []*BatchQueueItem
	for rows.Next() {
		item, err := scanBatchQueueItem(rows)
		if err != nil {
			return nil, fmt.Errorf("list pending: scan: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list pending: iterate: %w", err)
	}

	return items, nil
}

// Dequeue atomically selects the oldest pending item and transitions it to
// processing status. It returns nil if the queue is empty.
func (r *BatchQueueRepository) Dequeue(ctx context.Context) (*BatchQueueItem, error) {
	conn, err := r.db.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("dequeue: get conn: %w", err)
	}
	defer conn.Close()

	// Retry BEGIN IMMEDIATE to handle SQLITE_BUSY under concurrent access.
	var began bool
	for attempt := 0; attempt < 50; attempt++ {
		if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err == nil {
			began = true
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !began {
		if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
			return nil, fmt.Errorf("dequeue: begin immediate: %w", err)
		}
	}
	committed := false
	defer func() {
		if !committed {
			conn.ExecContext(ctx, "ROLLBACK")
		}
	}()

	var item BatchQueueItem
	var createdAt string
	var startedAt sql.NullString
	var completedAt sql.NullString

	err = conn.QueryRowContext(ctx, `
		SELECT `+batchQueueColumns+`
		FROM batch_queue
		WHERE status = ?
		ORDER BY id ASC
		LIMIT 1
	`, BatchQueueStatusPending).Scan(
		&item.ID,
		&item.FilePath,
		&item.Status,
		&item.Progress,
		&createdAt,
		&startedAt,
		&completedAt,
	)
	if err == sql.ErrNoRows {
		if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
			return nil, fmt.Errorf("dequeue: commit empty: %w", err)
		}
		committed = true
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("dequeue: select: %w", err)
	}

	if createdAt != "" {
		item.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	}

	now := time.Now().UTC()
	_, err = conn.ExecContext(ctx, `
		UPDATE batch_queue
		SET status = ?, started_at = ?
		WHERE id = ?
	`, BatchQueueStatusProcessing, now.Format(time.RFC3339), item.ID)
	if err != nil {
		return nil, fmt.Errorf("dequeue: update: %w", err)
	}

	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return nil, fmt.Errorf("dequeue: commit: %w", err)
	}
	committed = true

	item.Status = BatchQueueStatusProcessing
	item.StartedAt = &now
	return &item, nil
}

// UpdateStatus changes the status of a queue item and persists progress.
// It returns an error if the transition is illegal.
func (r *BatchQueueRepository) UpdateStatus(id int64, status string, progress float64) error {
	current, err := r.GetByID(id)
	if err != nil {
		return fmt.Errorf("update status: get current: %w", err)
	}

	allowed, ok := validTransitions[current.Status]
	if !ok || !allowed[status] {
		return fmt.Errorf("update status: illegal transition from %q to %q", current.Status, status)
	}

	now := time.Now().UTC()
	var completedAt interface{}
	if current.Status == BatchQueueStatusProcessing && (status == BatchQueueStatusCompleted || status == BatchQueueStatusError || status == BatchQueueStatusCancelled) {
		completedAt = now.Format(time.RFC3339)
	}

	_, err = r.db.Exec(`
		UPDATE batch_queue
		SET status = ?, progress = ?, completed_at = ?
		WHERE id = ?
	`, status, progress, completedAt, id)
	if err != nil {
		return fmt.Errorf("update status: %w", err)
	}

	return nil
}

// Cancel transitions a queue item to cancelled status. It is idempotent —
// cancelling an already-cancelled item is a no-op. It returns an error if the
// id does not exist.
func (r *BatchQueueRepository) Cancel(id int64) error {
	current, err := r.GetByID(id)
	if err != nil {
		return fmt.Errorf("cancel: %w", err)
	}

	if current.Status == BatchQueueStatusCancelled {
		return nil
	}

	now := time.Now().UTC()
	_, err = r.db.Exec(`
		UPDATE batch_queue
		SET status = ?, completed_at = ?
		WHERE id = ?
	`, BatchQueueStatusCancelled, now.Format(time.RFC3339), id)
	if err != nil {
		return fmt.Errorf("cancel: %w", err)
	}

	return nil
}

// ReconcileProcessingToPending moves all items stuck in "processing" status
// back to "pending". This is used on startup to recover from crashes. It
// returns the number of rows reconciled.
func (r *BatchQueueRepository) ReconcileProcessingToPending() (int64, error) {
	result, err := r.db.Exec(`
		UPDATE batch_queue
		SET status = ?, started_at = NULL
		WHERE status = ?
	`, BatchQueueStatusPending, BatchQueueStatusProcessing)
	if err != nil {
		return 0, fmt.Errorf("reconcile: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("reconcile: rows affected: %w", err)
	}

	return rows, nil
}

// GetByID retrieves a batch queue item by its ID.
func (r *BatchQueueRepository) GetByID(id int64) (*BatchQueueItem, error) {
	item, err := scanBatchQueueItem(r.db.QueryRow(`
		SELECT `+batchQueueColumns+`
		FROM batch_queue
		WHERE id = ?
	`, id))
	if err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	return item, nil
}

// GetByPath retrieves a batch queue item by its file path.
func (r *BatchQueueRepository) GetByPath(path string) (*BatchQueueItem, error) {
	item, err := scanBatchQueueItem(r.db.QueryRow(`
		SELECT `+batchQueueColumns+`
		FROM batch_queue
		WHERE file_path = ?
	`, path))
	if err != nil {
		return nil, fmt.Errorf("get by path: %w", err)
	}
	return item, nil
}
