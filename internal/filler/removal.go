package filler

import (
	"encoding/json"
	"sort"
)

type RecordingProvider interface {
	GetByID(id int64) (Recording, error)
}

type Recording struct {
	ID                int64
	FilePath          string
	TranscriptionJSON string
}

type FillerRemovalService struct {
	recordingRepo RecordingProvider
	editor        SegmentEditor
}

type SegmentEditor interface {
	ApplyEdit(segment MediaSegment, outputPath string) error
	ApplyEdits(segments []MediaSegment, outputPath string) error
}

type MediaSegment struct {
	SourcePath string
	StartTime  float64
	EndTime    float64
	OutputPath string
}

func NewFillerRemovalService(recordingRepo RecordingProvider, editor SegmentEditor) *FillerRemovalService {
	return &FillerRemovalService{
		recordingRepo: recordingRepo,
		editor:        editor,
	}
}

type RemovalResult struct {
	Success                  bool
	OutputPath               string
	RemovedFillers           int
	RemainingFillers         int
	UpdatedTranscriptionJSON string
	Error                    error
}

func (s *FillerRemovalService) RemoveFiller(recordingID int64, filler *FillerWord) (*RemovalResult, error) {
	recording, err := s.recordingRepo.GetByID(recordingID)
	if err != nil {
		return nil, err
	}

	fillers, err := s.getFillersForRecording(recording)
	if err != nil {
		return nil, err
	}

	segments := s.computeNonFillerSegments(recording.FilePath, filler, fillers)

	tempOutput := recording.FilePath + ".filler_removal.mkv"
	if err := s.editor.ApplyEdits(segments, tempOutput); err != nil {
		return &RemovalResult{
			Success:        false,
			RemovedFillers: 0,
			Error:          err,
		}, err
	}

	updatedFillers := s.filterOutFiller(fillers, filler)

	return &RemovalResult{
		Success:          true,
		OutputPath:       tempOutput,
		RemovedFillers:   1,
		RemainingFillers: len(updatedFillers),
	}, nil
}

func (s *FillerRemovalService) RemoveAllFillers(recordingID int64) (*RemovalResult, error) {
	recording, err := s.recordingRepo.GetByID(recordingID)
	if err != nil {
		return nil, err
	}

	fillers, err := s.getFillersForRecording(recording)
	if err != nil {
		return nil, err
	}

	if len(fillers) == 0 {
		return &RemovalResult{
			Success: true,
			Error:   nil,
		}, nil
	}

	segments := s.computeNonFillerSegmentsMultiple(recording.FilePath, fillers)

	tempOutput := recording.FilePath + ".filler_removal.mkv"
	if err := s.editor.ApplyEdits(segments, tempOutput); err != nil {
		return &RemovalResult{
			Success:        false,
			RemovedFillers: 0,
			Error:          err,
		}, err
	}

	updatedTranscription, _ := s.computeUpdatedTranscription(recording.TranscriptionJSON, fillers)

	return &RemovalResult{
		Success:                  true,
		OutputPath:               tempOutput,
		RemovedFillers:           len(fillers),
		RemainingFillers:         0,
		UpdatedTranscriptionJSON: updatedTranscription,
	}, nil
}

func (s *FillerRemovalService) getFillersForRecording(recording Recording) ([]*FillerWord, error) {
	if recording.TranscriptionJSON == "" {
		return []*FillerWord{}, nil
	}

	var transcriptionData TranscriptionData
	if err := json.Unmarshal([]byte(recording.TranscriptionJSON), &transcriptionData); err != nil {
		return nil, err
	}

	words := make([]Word, len(transcriptionData.Words))
	for i, w := range transcriptionData.Words {
		words[i] = Word{
			Text:  w.Text,
			Start: w.Start,
			End:   w.End,
		}
	}

	detector := NewDefaultDetector(DefaultConfig())
	return detector.Detect(words), nil
}

func (s *FillerRemovalService) computeNonFillerSegments(sourcePath string, target *FillerWord, allFillers []*FillerWord) []MediaSegment {
	var segments []MediaSegment

	sort.Slice(allFillers, func(i, j int) bool {
		return allFillers[i].Start < allFillers[j].Start
	})

	var currentStart float64 = 0
	var targetEnd float64 = 0
	found := false

	for i, f := range allFillers {
		if f.Start == target.Start && f.End == target.End && f.Text == target.Text {
			if currentStart < f.Start {
				segments = append(segments, MediaSegment{
					SourcePath: sourcePath,
					StartTime:  currentStart,
					EndTime:    f.Start,
				})
			}
			targetEnd = f.End
			found = true

			for j := i + 1; j < len(allFillers); j++ {
				nextF := allFillers[j]
				if targetEnd < nextF.Start {
					segments = append(segments, MediaSegment{
						SourcePath: sourcePath,
						StartTime:  targetEnd,
						EndTime:    nextF.Start,
					})
				}
				targetEnd = nextF.End
			}
			break
		}
		currentStart = f.End
	}

	if !found {
		return segments
	}

	if targetEnd > 0 {
		segments = append(segments, MediaSegment{
			SourcePath: sourcePath,
			StartTime:  targetEnd,
			EndTime:    3600.0,
		})
	}

	return segments
}

func (s *FillerRemovalService) computeNonFillerSegmentsMultiple(sourcePath string, fillers []*FillerWord) []MediaSegment {
	if len(fillers) == 0 {
		return []MediaSegment{}
	}

	sort.Slice(fillers, func(i, j int) bool {
		return fillers[i].Start < fillers[j].Start
	})

	var segments []MediaSegment
	var currentStart float64 = 0

	for _, f := range fillers {
		if f.Start > currentStart {
			segments = append(segments, MediaSegment{
				SourcePath: sourcePath,
				StartTime:  currentStart,
				EndTime:    f.Start,
			})
		}
		currentStart = f.End
	}

	if currentStart < 3600.0 {
		segments = append(segments, MediaSegment{
			SourcePath: sourcePath,
			StartTime:  currentStart,
			EndTime:    3600.0,
		})
	}

	return segments
}

func (s *FillerRemovalService) filterOutFiller(fillers []*FillerWord, target *FillerWord) []*FillerWord {
	var result []*FillerWord
	for _, f := range fillers {
		if f != target {
			result = append(result, f)
		}
	}
	return result
}

func (s *FillerRemovalService) computeUpdatedTranscription(originalJSON string, removedFillers []*FillerWord) (string, error) {
	if originalJSON == "" {
		return "", nil
	}

	var data TranscriptionData
	if err := json.Unmarshal([]byte(originalJSON), &data); err != nil {
		return "", err
	}

	fillerSet := make(map[float64]bool)
	for _, f := range removedFillers {
		for _, w := range data.Words {
			if w.Start >= f.Start && w.End <= f.End && w.Text == f.Text {
				fillerSet[w.Start] = true
			}
		}
	}

	var newWords []Word
	for _, w := range data.Words {
		if !fillerSet[w.Start] {
			newWords = append(newWords, w)
		}
	}

	data.Words = newWords

	updatedJSON, err := json.Marshal(data)
	if err != nil {
		return "", err
	}

	return string(updatedJSON), nil
}
