package edit

import (
	"encoding/json"
	"fmt"
)

type ReorderOperation struct {
	FromIndex     int   `json:"from"`
	ToIndex       int   `json:"to"`
	SourceIndices []int `json:"source_indices"`
}

func NewReorderOperation(from, to int, sourceIndices []int) *ReorderOperation {
	return &ReorderOperation{
		FromIndex:     from,
		ToIndex:       to,
		SourceIndices: sourceIndices,
	}
}

func (r *ReorderOperation) Type() OperationType { return OperationReorder }

func (r *ReorderOperation) String() string {
	return fmt.Sprintf("ReorderOperation(from=%d, to=%d, sources=%v)", r.FromIndex, r.ToIndex, r.SourceIndices)
}

func (r *ReorderOperation) MarshalJSON() ([]byte, error) {
	type alias ReorderOperation
	return json.Marshal(&struct {
		Type string `json:"type"`
		*alias
	}{
		Type:  string(OperationReorder),
		alias: (*alias)(r),
	})
}

func (r *ReorderOperation) Apply(words []WordData) ([]WordData, error) {
	if r.FromIndex < 0 || r.ToIndex > len(words) || r.FromIndex >= r.ToIndex {
		return nil, ErrInvalidRange
	}

	if len(r.SourceIndices) == 0 {
		return words, nil
	}

	result := make([]WordData, len(words))
	copy(result, words)

	extracted := make([]WordData, len(r.SourceIndices))
	for i, idx := range r.SourceIndices {
		if idx < 0 || idx >= len(words) {
			return nil, ErrInvalidRange
		}
		extracted[i] = result[idx]
	}

	insertionPoint := r.ToIndex
	for i, word := range extracted {
		if insertionPoint+i < len(result) {
			result[insertionPoint+i] = word
		}
	}

	for i := range result {
		result[i].Index = i
	}

	return result, nil
}

func (r *ReorderOperation) Undo(words []WordData) ([]WordData, error) {
	return nil, ErrNotImplemented
}

var _ Operation = (*ReorderOperation)(nil)
