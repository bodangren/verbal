package edit

import (
	"encoding/json"
	"fmt"
)

type InsertSilenceOperation struct {
	Position  int     `json:"position"`
	Duration  float64 `json:"duration"`
}

func NewInsertSilenceOperation(position int, duration float64) *InsertSilenceOperation {
	return &InsertSilenceOperation{
		Position: position,
		Duration: duration,
	}
}

func (i *InsertSilenceOperation) Type() OperationType { return OperationInsertSilence }

func (i *InsertSilenceOperation) String() string {
	return fmt.Sprintf("InsertSilenceOperation(position=%d, duration=%.2f)", i.Position, i.Duration)
}

func (i *InsertSilenceOperation) MarshalJSON() ([]byte, error) {
	type alias InsertSilenceOperation
	return json.Marshal(&struct {
		Type string `json:"type"`
		*alias
	}{
		Type:  string(OperationInsertSilence),
		alias: (*alias)(i),
	})
}

func (i *InsertSilenceOperation) Apply(words []WordData) ([]WordData, error) {
	if i.Position < 0 || i.Position > len(words) {
		return nil, ErrInvalidRange
	}
	if i.Duration <= 0 {
		return nil, fmt.Errorf("silence duration must be positive")
	}

	result := make([]WordData, 0, len(words)+1)

	for idx, w := range words {
		if idx == i.Position && i.Position < len(words) {
			currentWord := w
			currentWord.EndTime = currentWord.StartTime
			result = append(result, currentWord)
			silenceWord := WordData{
				Text:      "[silence]",
				StartTime: currentWord.StartTime,
				EndTime:   currentWord.StartTime + i.Duration,
				Index:     len(result),
			}
			result = append(result, silenceWord)
			nextWord := words[i.Position]
			nextWord.StartTime = currentWord.StartTime + i.Duration
			nextWord.EndTime = nextWord.EndTime + i.Duration
			result = append(result, nextWord)
		} else if idx > i.Position {
			w.StartTime += i.Duration
			w.EndTime += i.Duration
			w.Index = len(result)
			result = append(result, w)
		} else {
			result = append(result, w)
		}
	}

	if i.Position == len(words) {
		lastEnd := words[len(words)-1].EndTime
		silenceWord := WordData{
			Text:      "[silence]",
			StartTime: lastEnd,
			EndTime:   lastEnd + i.Duration,
			Index:     len(result),
		}
		result = append(result, silenceWord)
	}

	return result, nil
}

func (i *InsertSilenceOperation) Undo(words []WordData) ([]WordData, error) {
	return nil, ErrNotImplemented
}

var _ Operation = (*InsertSilenceOperation)(nil)
