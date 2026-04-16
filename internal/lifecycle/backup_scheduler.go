package lifecycle

import (
	"fmt"
	"sync"
	"time"
)

// Logger provides a minimal logging interface for the lifecycle package.
// This allows the package to log errors and warnings without depending
// on a specific logging implementation.
type Logger interface {
	Info(msg string)
	Warn(msg string)
	Error(msg string)
}

// noopLogger is a no-op Logger implementation used when no logger is provided.
type noopLogger struct{}

func (n *noopLogger) Info(msg string)  {}
func (n *noopLogger) Warn(msg string)  {}
func (n *noopLogger) Error(msg string) {}

// safeCallback invokes the callback with panic recovery to prevent the scheduler
// goroutine from crashing due to panics in user-provided callbacks.
func (bs *BackupScheduler) safeCallback(path string, err error) {
	bs.mu.RLock()
	callback := bs.onBackupComplete
	logger := bs.logger
	bs.mu.RUnlock()

	if callback == nil {
		return
	}

	defer func() {
		if r := recover(); r != nil {
			msg := fmt.Sprintf("panic in onBackupComplete callback: %v", r)
			if logger != nil {
				logger.Error(msg)
			}
		}
	}()

	callback(path, err)
}

// BackupFrequency represents the frequency of automatic backups.
type BackupFrequency string

const (
	// Daily backup frequency
	Daily BackupFrequency = "daily"
	// Weekly backup frequency
	Weekly BackupFrequency = "weekly"
)

// BackupScheduler manages automatic backup scheduling.
type BackupScheduler struct {
	manager          *BackupManager
	frequency        BackupFrequency
	running          bool
	stopCh           chan struct{}
	lastBackup       time.Time
	nextBackup       time.Time
	onBackupComplete func(string, error)
	logger           Logger
	mu               sync.RWMutex
}

// NewBackupScheduler creates a new BackupScheduler instance.
// The logger parameter can be nil to use a no-op logger.
func NewBackupScheduler(manager *BackupManager, logger Logger) *BackupScheduler {
	if logger == nil {
		logger = &noopLogger{}
	}
	return &BackupScheduler{
		manager:          manager,
		frequency:        Daily,
		running:          false,
		stopCh:           make(chan struct{}),
		onBackupComplete: nil,
		logger:           logger,
	}
}

// Start begins the automatic backup scheduler.
func (bs *BackupScheduler) Start() {
	bs.mu.Lock()
	defer bs.mu.Unlock()

	if bs.running {
		return
	}

	bs.running = true
	bs.stopCh = make(chan struct{})

	// Calculate initial next backup time if not set
	if bs.nextBackup.IsZero() {
		bs.nextBackup = calculateNextBackup(bs.frequency, time.Now())
	}

	go bs.run()
}

// Stop halts the automatic backup scheduler.
func (bs *BackupScheduler) Stop() {
	bs.mu.Lock()
	defer bs.mu.Unlock()

	if !bs.running {
		return
	}

	bs.running = false
	close(bs.stopCh)
}

// run is the main scheduler loop.
func (bs *BackupScheduler) run() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-bs.stopCh:
			return
		case now := <-ticker.C:
			bs.mu.RLock()
			nextBackup := bs.nextBackup
			frequency := bs.frequency
			bs.mu.RUnlock()

			// Check if it's time for a backup
			if !nextBackup.IsZero() && now.After(nextBackup) {
				bs.performScheduledBackup()

				// Calculate next backup time
				bs.mu.Lock()
				bs.nextBackup = calculateNextBackup(frequency, time.Now())
				bs.mu.Unlock()
			}
		}
	}
}

// performScheduledBackup creates a backup and handles rotation.
func (bs *BackupScheduler) performScheduledBackup() {
	backupPath, err := bs.manager.CreateBackup()
	if err != nil {
		// Log the error
		bs.mu.RLock()
		logger := bs.logger
		bs.mu.RUnlock()
		if logger != nil {
			logger.Error(fmt.Sprintf("scheduled backup failed: %v", err))
		}
		// Notify callback of failure (with panic recovery)
		bs.safeCallback("", err)
		return
	}

	// Update last backup time
	bs.mu.Lock()
	bs.lastBackup = time.Now()
	bs.mu.Unlock()

	// Perform rotation
	retentionCount := bs.manager.GetRetentionCount()
	if rotErr := bs.manager.RotateBackups(retentionCount); rotErr != nil {
		// Log rotation errors as warnings (non-fatal)
		bs.mu.RLock()
		logger := bs.logger
		bs.mu.RUnlock()
		if logger != nil {
			logger.Warn(fmt.Sprintf("backup rotation warning: %v", rotErr))
		}
	}

	// Notify callback of success (with panic recovery)
	bs.safeCallback(backupPath, nil)
}

// TriggerBackup manually triggers a backup immediately.
func (bs *BackupScheduler) TriggerBackup() (string, error) {
	backupPath, err := bs.manager.CreateBackup()
	if err != nil {
		return "", err
	}

	bs.mu.Lock()
	bs.lastBackup = time.Now()
	bs.mu.Unlock()

	// Perform rotation
	retentionCount := bs.manager.GetRetentionCount()
	if rotErr := bs.manager.RotateBackups(retentionCount); rotErr != nil {
		// Log rotation errors as warnings (non-fatal)
		bs.mu.RLock()
		logger := bs.logger
		bs.mu.RUnlock()
		if logger != nil {
			logger.Warn(fmt.Sprintf("backup rotation warning: %v", rotErr))
		}
	}

	// Notify callback (with panic recovery)
	bs.safeCallback(backupPath, nil)

	return backupPath, nil
}

// SetFrequency sets the backup frequency.
func (bs *BackupScheduler) SetFrequency(freq BackupFrequency) {
	bs.mu.Lock()
	defer bs.mu.Unlock()

	switch freq {
	case Daily, Weekly:
		bs.frequency = freq
	default:
		bs.frequency = Daily // Default to daily for invalid values
	}

	// Recalculate next backup time if running
	if bs.running {
		bs.nextBackup = calculateNextBackup(bs.frequency, time.Now())
	}
}

// GetFrequency returns the current backup frequency.
func (bs *BackupScheduler) GetFrequency() BackupFrequency {
	bs.mu.RLock()
	defer bs.mu.RUnlock()
	return bs.frequency
}

// SetNextBackupTime sets the next scheduled backup time.
func (bs *BackupScheduler) SetNextBackupTime(t time.Time) {
	bs.mu.Lock()
	defer bs.mu.Unlock()
	bs.nextBackup = t
}

// GetNextBackupTime returns the next scheduled backup time.
func (bs *BackupScheduler) GetNextBackupTime() time.Time {
	bs.mu.RLock()
	defer bs.mu.RUnlock()
	return bs.nextBackup
}

// GetLastBackupTime returns the time of the last backup.
func (bs *BackupScheduler) GetLastBackupTime() time.Time {
	bs.mu.RLock()
	defer bs.mu.RUnlock()
	return bs.lastBackup
}

// IsRunning returns whether the scheduler is currently running.
func (bs *BackupScheduler) IsRunning() bool {
	bs.mu.RLock()
	defer bs.mu.RUnlock()
	return bs.running
}

// SetOnBackupComplete sets a callback function to be called when a backup completes.
// The callback receives the backup path and any error that occurred.
func (bs *BackupScheduler) SetOnBackupComplete(callback func(string, error)) {
	bs.mu.Lock()
	defer bs.mu.Unlock()
	bs.onBackupComplete = callback
}

// calculateNextBackup calculates the next backup time based on frequency.
func calculateNextBackup(freq BackupFrequency, from time.Time) time.Time {
	switch freq {
	case Daily:
		// Next backup at midnight tomorrow
		tomorrow := from.Add(24 * time.Hour)
		return time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 0, 0, 0, 0, from.Location())
	case Weekly:
		// Next backup at midnight on next Sunday
		daysUntilSunday := (7 - int(from.Weekday())) % 7
		if daysUntilSunday == 0 {
			daysUntilSunday = 7 // If today is Sunday, go to next Sunday
		}
		nextSunday := from.Add(time.Duration(daysUntilSunday) * 24 * time.Hour)
		return time.Date(nextSunday.Year(), nextSunday.Month(), nextSunday.Day(), 0, 0, 0, 0, from.Location())
	default:
		// Default to daily
		tomorrow := from.Add(24 * time.Hour)
		return time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 0, 0, 0, 0, from.Location())
	}
}
