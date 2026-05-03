package edit

import (
	"encoding/json"
	"fmt"
)

type SplitOperation struct {
	WordIndex int `json:"word_index"`
}

func NewSplitOperation(wordIndex int) *SplitOperation {
	return &SplitOperation{
		WordIndex: wordIndex,
	}
}

func (s *SplitOperation) Type() OperationType { return OperationSplit }

func (s *SplitOperation) String() string {
	return fmt.Sprintf("SplitOperation(word_index=%d)", s.WordIndex)
}

func (s *SplitOperation) MarshalJSON() ([]byte, error) {
	type alias SplitOperation
	return json.Marshal(&struct {
		Type string `json:"type"`
		*alias
	}{
		Type:  string(OperationSplit),
		alias: (*alias)(s),
	})
}

func (s *SplitOperation) Apply(words []WordData) ([]WordData, error) {
	if s.WordIndex <= 0 || s.WordIndex >= len(words) {
		return nil, fmt.Errorf("split index must be between 1 and len(words)-1")
	}

	result := make([]WordData, len(words)+1)
	copy(result[:s.WordIndex], words[:s.WordIndex])

	midWord := words[s.WordIndex]
	result[s.WordIndex] = WordData{
		Text:      midWord.Text,
		StartTime: midWord.StartTime,
		EndTime:   midWord.StartTime,
		Index:     s.WordIndex,
	}

	copy(result[s.WordIndex+1:], words[s.WordIndex:])

	for i := range result {
		result[i].Index = i
	}

	return result, nil
}

func (s *SplitOperation) Undo(words []WordData) ([]WordData, error) {
	return nil, ErrNotImplemented
}

var _ Operation = (*SplitOperation)(nil)
