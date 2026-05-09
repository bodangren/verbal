package db

import (
	"encoding/json"
	"sync"
	"time"
)

type Logger interface {
	Info(msg string)
	Warn(msg string)
	Error(msg string)
}

type noopLogger struct{}

func (n *noopLogger) Info(msg string)  {}
func (n *noopLogger) Warn(msg string)  {}
func (n *noopLogger) Error(msg string) {}

type AutoSaveService struct {
	db              *Database
	interval        time.Duration
	running         bool
	stopCh          chan struct{}
	dirty           bool
	dirtyMu         sync.RWMutex
	currentProject  int64
	currentData     *AutoSave
	currentDataMu   sync.RWMutex
	logger          Logger
	onAutoSaveComplete func(projectID int64, err error)
	onAutoSaveCompleteMu sync.RWMutex
}

func NewAutoSaveService(db *Database, interval time.Duration, logger Logger) *AutoSaveService {
	if logger == nil {
		logger = &noopLogger{}
	}
	return &AutoSaveService{
		db:       db,
		interval: interval,
		running:  false,
		stopCh:   make(chan struct{}),
		logger:   logger,
	}
}

func (s *AutoSaveService) Start() {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()

	if s.running {
		return
	}

	s.running = true
	s.stopCh = make(chan struct{})

	go s.run()
}

func (s *AutoSaveService) Stop() {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()

	if !s.running {
		return
	}

	s.running = false
	close(s.stopCh)
}

func (s *AutoSaveService) run() {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.dirtyMu.RLock()
			dirty := s.dirty
			s.dirtyMu.RUnlock()

			if dirty {
				s.performAutoSave()
			}
		}
	}
}

func (s *AutoSaveService) performAutoSave() {
	s.currentDataMu.RLock()
	projectID := s.currentProject
	data := s.currentData
	s.currentDataMu.RUnlock()

	if projectID == 0 || data == nil {
		return
	}

	err := s.db.AutoSaveRepo().SaveAutoSave(data)
	if err != nil {
		s.logger.Error("auto-save failed: " + err.Error())
		s.safeCallback(projectID, err)
		return
	}

	s.dirtyMu.Lock()
	s.dirty = false
	s.dirtyMu.Unlock()

	s.safeCallback(projectID, nil)
}

func (s *AutoSaveService) safeCallback(projectID int64, err error) {
	s.onAutoSaveCompleteMu.RLock()
	callback := s.onAutoSaveComplete
	s.onAutoSaveCompleteMu.RUnlock()

	if callback == nil {
		return
	}

	defer func() {
		if r := recover(); r != nil {
			s.logger.Error("panic in onAutoSaveComplete callback")
		}
	}()

	callback(projectID, err)
}

func (s *AutoSaveService) MarkDirty() {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()
	s.dirty = true
}

func (s *AutoSaveService) IsDirty() bool {
	s.dirtyMu.RLock()
	defer s.dirtyMu.RUnlock()
	return s.dirty
}

func (s *AutoSaveService) SetProject(projectID int64, transcriptJSON, operationsJSON string, playbackPosition int64) {
	s.currentDataMu.Lock()
	defer s.currentDataMu.Unlock()

	s.currentProject = projectID
	s.currentData = &AutoSave{
		ProjectID:        projectID,
		TranscriptJSON:   transcriptJSON,
		OperationsJSON:   operationsJSON,
		PlaybackPosition: playbackPosition,
	}

	s.dirtyMu.Lock()
	s.dirty = true
	s.dirtyMu.Unlock()
}

func (s *AutoSaveService) GetProject() (int64, *AutoSave) {
	s.currentDataMu.RLock()
	defer s.currentDataMu.RUnlock()
	return s.currentProject, s.currentData
}

func (s *AutoSaveService) SetOnAutoSaveComplete(callback func(projectID int64, err error)) {
	s.onAutoSaveCompleteMu.Lock()
	defer s.onAutoSaveCompleteMu.Unlock()
	s.onAutoSaveComplete = callback
}

func (s *AutoSaveService) SetInterval(interval time.Duration) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()
	s.interval = interval
}

func (s *AutoSaveService) GetInterval() time.Duration {
	s.dirtyMu.RLock()
	defer s.dirtyMu.RUnlock()
	return s.interval
}

type AutoSaveData struct {
	TranscriptJSON  string
	OperationsJSON string
}

func (s *AutoSaveService) MarshalCurrentData() (string, error) {
	s.currentDataMu.RLock()
	defer s.currentDataMu.RUnlock()

	if s.currentData == nil {
		return "{}", nil
	}

	data := AutoSaveData{
		TranscriptJSON:  s.currentData.TranscriptJSON,
		OperationsJSON: s.currentData.OperationsJSON,
	}

	bytes, err := json.Marshal(data)
	if err != nil {
		return "{}", err
	}

	return string(bytes), nil
}

func (s *AutoSaveService) HasCurrentAutoSave() (bool, error) {
	s.currentDataMu.RLock()
	projectID := s.currentProject
	s.currentDataMu.RUnlock()

	if projectID == 0 {
		return false, nil
	}

	return s.db.AutoSaveRepo().HasAutoSave(projectID)
}

func (s *AutoSaveService) GetCurrentAutoSaveInfo() (*AutoSaveInfo, error) {
	s.currentDataMu.RLock()
	projectID := s.currentProject
	s.currentDataMu.RUnlock()

	if projectID == 0 {
		return nil, nil
	}

	return s.db.AutoSaveRepo().GetAutoSaveInfo(projectID)
}
