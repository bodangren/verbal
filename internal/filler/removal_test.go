package filler

import (
	"testing"
)

type mockSegmentEditor struct {
	appliedSegments []MediaSegment
	shouldFail     bool
	lastOutputPath string
}

func (m *mockSegmentEditor) ApplyEdit(segment MediaSegment, outputPath string) error {
	if m.shouldFail {
		return &testError{msg: "mock error"}
	}
	m.appliedSegments = append(m.appliedSegments, segment)
	m.lastOutputPath = outputPath
	return nil
}

func (m *mockSegmentEditor) ApplyEdits(segments []MediaSegment, outputPath string) error {
	if m.shouldFail {
		return &testError{msg: "mock error"}
	}
	m.appliedSegments = append(m.appliedSegments, segments...)
	m.lastOutputPath = outputPath
	return nil
}

type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}

type mockRecordingProvider struct {
	recordings map[int64]Recording
}

func newMockRecordingProvider() *mockRecordingProvider {
	return &mockRecordingProvider{
		recordings: make(map[int64]Recording),
	}
}

func (r *mockRecordingProvider) Add(recording Recording) {
	r.recordings[recording.ID] = recording
}

func (r *mockRecordingProvider) GetByID(id int64) (Recording, error) {
	rec, ok := r.recordings[id]
	if !ok {
		return Recording{}, &testError{msg: "not found"}
	}
	return rec, nil
}

func TestFillerRemovalService_RemoveFiller(t *testing.T) {
	repo := newMockRecordingProvider()
	mockEditor := &mockSegmentEditor{}

	service := NewFillerRemovalService(repo, mockEditor)

	recording := Recording{
		ID:                1,
		FilePath:          "/path/to/video.mp4",
		TranscriptionJSON: `{"text": "hello um world", "words": [{"text": "hello", "start": 0.0, "end": 0.5}, {"text": "um", "start": 0.5, "end": 0.7}, {"text": "world", "start": 0.7, "end": 1.0}]}`,
	}
	repo.Add(recording)

	filler := &FillerWord{
		Text:  "um",
		Start: 0.5,
		End:   0.7,
		Type:  TypeShortFiller,
	}

	result, err := service.RemoveFiller(1, filler)
	if err != nil {
		t.Fatalf("RemoveFiller failed: %v", err)
	}

	if !result.Success {
		t.Error("Expected success")
	}

	if result.RemovedFillers != 1 {
		t.Errorf("Expected 1 removed filler, got %d", result.RemovedFillers)
	}

	if len(mockEditor.appliedSegments) == 0 {
		t.Error("Expected segments to be applied")
	}
}

func TestFillerRemovalService_RemoveAllFillers(t *testing.T) {
	repo := newMockRecordingProvider()
	mockEditor := &mockSegmentEditor{}

	service := NewFillerRemovalService(repo, mockEditor)

	recording := Recording{
		ID:                1,
		FilePath:          "/path/to/video.mp4",
		TranscriptionJSON: `{"text": "hello um like world", "words": [{"text": "hello", "start": 0.0, "end": 0.5}, {"text": "um", "start": 0.5, "end": 0.6}, {"text": "like", "start": 0.6, "end": 0.8}, {"text": "world", "start": 0.8, "end": 1.0}]}`,
	}
	repo.Add(recording)

	result, err := service.RemoveAllFillers(1)
	if err != nil {
		t.Fatalf("RemoveAllFillers failed: %v", err)
	}

	if !result.Success {
		t.Error("Expected success")
	}

	if result.RemovedFillers != 2 {
		t.Errorf("Expected 2 removed fillers, got %d", result.RemovedFillers)
	}
}

func TestFillerRemovalService_RemoveFiller_NoFillers(t *testing.T) {
	repo := newMockRecordingProvider()
	mockEditor := &mockSegmentEditor{}

	service := NewFillerRemovalService(repo, mockEditor)

	recording := Recording{
		ID:                1,
		FilePath:          "/path/to/video.mp4",
		TranscriptionJSON: `{"text": "hello world", "words": [{"text": "hello", "start": 0.0, "end": 0.5}, {"text": "world", "start": 0.5, "end": 1.0}]}`,
	}
	repo.Add(recording)

	result, err := service.RemoveAllFillers(1)
	if err != nil {
		t.Fatalf("RemoveAllFillers failed: %v", err)
	}

	if !result.Success {
		t.Error("Expected success even with no fillers")
	}

	if result.RemovedFillers != 0 {
		t.Errorf("Expected 0 removed fillers, got %d", result.RemovedFillers)
	}
}

func TestFillerRemovalService_RemoveFiller_EditorError(t *testing.T) {
	repo := newMockRecordingProvider()
	mockEditor := &mockSegmentEditor{shouldFail: true}

	service := NewFillerRemovalService(repo, mockEditor)

	recording := Recording{
		ID:                1,
		FilePath:          "/path/to/video.mp4",
		TranscriptionJSON: `{"text": "hello um world", "words": [{"text": "hello", "start": 0.0, "end": 0.5}, {"text": "um", "start": 0.5, "end": 0.7}, {"text": "world", "start": 0.7, "end": 1.0}]}`,
	}
	repo.Add(recording)

	filler := &FillerWord{
		Text:  "um",
		Start: 0.5,
		End:   0.7,
		Type:  TypeShortFiller,
	}

	result, err := service.RemoveFiller(1, filler)
	if err == nil {
		t.Error("Expected error")
	}

	if result != nil && result.Success {
		t.Error("Expected failure result")
	}
}

func TestFillerRemovalService_ComputeNonFillerSegments(t *testing.T) {
	repo := newMockRecordingProvider()
	mockEditor := &mockSegmentEditor{}

	service := NewFillerRemovalService(repo, mockEditor)

	filler := &FillerWord{
		Text:  "um",
		Start: 1.0,
		End:   1.2,
		Type:  TypeShortFiller,
	}

	allFillers := []*FillerWord{filler}

	segments := service.computeNonFillerSegments("/path/to/video.mp4", filler, allFillers)

	if len(segments) == 0 {
		t.Error("Expected at least one segment")
	}

	if segments[0].StartTime != 0 {
		t.Errorf("Expected segment start at 0, got %f", segments[0].StartTime)
	}

	if segments[0].EndTime != 1.0 {
		t.Errorf("Expected segment end at 1.0, got %f", segments[0].EndTime)
	}
}