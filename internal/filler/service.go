package filler

import (
	"encoding/json"
	"sync"
)

type FillerCache struct {
	mu      sync.RWMutex
	results map[int64][]*FillerWord
}

func NewFillerCache() *FillerCache {
	return &FillerCache{
		results: make(map[int64][]*FillerWord),
	}
}

func (c *FillerCache) Get(recordingID int64) ([]*FillerWord, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	result, ok := c.results[recordingID]
	return result, ok
}

func (c *FillerCache) Set(recordingID int64, fillers []*FillerWord) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.results[recordingID] = fillers
}

func (c *FillerCache) Clear(recordingID int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.results, recordingID)
}

type FillerService struct {
	detector  Detector
	cache     *FillerCache
	onProgress func(percent int, message string)
}

type FillerServiceOption func(*FillerService)

func WithProgressCallback(cb func(int, string)) FillerServiceOption {
	return func(s *FillerService) {
		s.onProgress = cb
	}
}

func NewFillerService(detector Detector, opts ...FillerServiceOption) *FillerService {
	svc := &FillerService{
		detector: detector,
		cache:    NewFillerCache(),
	}
	for _, opt := range opts {
		opt(svc)
	}
	return svc
}

func (s *FillerService) SetProgressCallback(cb func(int, string)) {
	s.onProgress = cb
}

type TranscriptionData struct {
	Text     string `json:"text"`
	Words    []Word `json:"words"`
	Language string `json:"language"`
	Duration float64 `json:"duration"`
}

func ParseTranscriptionJSON(jsonStr string) (*TranscriptionData, error) {
	if jsonStr == "" {
		return nil, nil
	}
	var data TranscriptionData
	if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
		return nil, err
	}
	return &data, nil
}

func (s *FillerService) Detect(transcriptionJSON string) ([]*FillerWord, error) {
	data, err := ParseTranscriptionJSON(transcriptionJSON)
	if err != nil {
		return nil, err
	}
	if data == nil || len(data.Words) == 0 {
		return []*FillerWord{}, nil
	}

	if s.onProgress != nil {
		s.onProgress(50, "Analyzing transcription...")
	}

	fillers := s.detector.Detect(data.Words)

	if s.onProgress != nil {
		s.onProgress(100, "Detection complete")
	}

	return fillers, nil
}

func (s *FillerService) DetectFromCache(recordingID int64, transcriptionJSON string) ([]*FillerWord, error) {
	if cached, ok := s.cache.Get(recordingID); ok {
		return cached, nil
	}

	fillers, err := s.Detect(transcriptionJSON)
	if err != nil {
		return nil, err
	}

	s.cache.Set(recordingID, fillers)
	return fillers, nil
}

func (s *FillerService) GetCached(recordingID int64) ([]*FillerWord, bool) {
	return s.cache.Get(recordingID)
}

func (s *FillerService) ClearCache(recordingID int64) {
	s.cache.Clear(recordingID)
}