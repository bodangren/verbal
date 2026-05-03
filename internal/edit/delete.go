package edit

import (
	"encoding/json"
	"fmt"
)

type DeleteOperation struct {
	FromIndex int `json:"from"`
	ToIndex   int `json:"to"`
}

func NewDeleteOperation(from, to int) *DeleteOperation {
	return &DeleteOperation{
		FromIndex: from,
		ToIndex:   to,
	}
}

func (d *DeleteOperation) Type() OperationType { return OperationDelete }

func (d *DeleteOperation) String() string {
	return fmt.Sprintf("DeleteOperation(from=%d, to=%d)", d.FromIndex, d.ToIndex)
}

func (d *DeleteOperation) MarshalJSON() ([]byte, error) {
	type alias DeleteOperation
	return json.Marshal(&struct {
		Type string `json:"type"`
		*alias
	}{
		Type:  string(OperationDelete),
		alias: (*alias)(d),
	})
}

func (d *DeleteOperation) Apply(words []WordData) ([]WordData, error) {
	if d.FromIndex < 0 || d.ToIndex > len(words) || d.FromIndex >= d.ToIndex {
		return nil, ErrInvalidRange
	}

	result := make([]WordData, 0, len(words)-(d.ToIndex-d.FromIndex))
	result = append(result, words[:d.FromIndex]...)
	result = append(result, words[d.ToIndex:]...)

	for i := range result {
		result[i].Index = i
	}

	return result, nil
}

func (d *DeleteOperation) Undo(words []WordData) ([]WordData, error) {
	return nil, ErrNotImplemented
}

func (d *DeleteOperation) TimeRange(words []WordData) (float64, float64) {
	if d.FromIndex < 0 || d.FromIndex >= len(words) {
		return 0, 0
	}
	if d.ToIndex <= 0 || d.ToIndex > len(words) {
		return 0, 0
	}
	return words[d.FromIndex].StartTime, words[d.ToIndex-1].EndTime
}

var _ Operation = (*DeleteOperation)(nil)