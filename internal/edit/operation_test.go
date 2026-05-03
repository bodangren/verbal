package edit

import (
	"testing"
)

func TestDeleteOperation_Apply(t *testing.T) {
	tests := []struct {
		name       string
		deleteFrom int
		deleteTo   int
		words      []WordData
		wantLen    int
		wantErr    bool
	}{
		{
			name:       "delete single word",
			deleteFrom: 1,
			deleteTo:   2,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
				NewWordData("world", 0.5, 1.0, 1),
				NewWordData("test", 1.0, 1.5, 2),
				NewWordData("case", 1.5, 2.0, 3),
			},
			wantLen: 3,
			wantErr: false,
		},
		{
			name:       "delete first word",
			deleteFrom: 0,
			deleteTo:   1,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
				NewWordData("world", 0.5, 1.0, 1),
			},
			wantLen: 1,
			wantErr: false,
		},
		{
			name:       "delete last word",
			deleteFrom: 3,
			deleteTo:   4,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
				NewWordData("world", 0.5, 1.0, 1),
				NewWordData("test", 1.0, 1.5, 2),
				NewWordData("case", 1.5, 2.0, 3),
			},
			wantLen: 3,
			wantErr: false,
		},
		{
			name:       "delete range of words",
			deleteFrom: 1,
			deleteTo:   3,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
				NewWordData("world", 0.5, 1.0, 1),
				NewWordData("test", 1.0, 1.5, 2),
				NewWordData("case", 1.5, 2.0, 3),
			},
			wantLen: 2,
			wantErr: false,
		},
		{
			name:       "delete all words",
			deleteFrom: 0,
			deleteTo:   4,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
				NewWordData("world", 0.5, 1.0, 1),
				NewWordData("test", 1.0, 1.5, 2),
				NewWordData("case", 1.5, 2.0, 3),
			},
			wantLen: 0,
			wantErr: false,
		},
		{
			name:       "invalid range from > to",
			deleteFrom: 3,
			deleteTo:   1,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
				NewWordData("world", 0.5, 1.0, 1),
			},
			wantLen: 0,
			wantErr: true,
		},
		{
			name:       "out of bounds",
			deleteFrom: 0,
			deleteTo:   10,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
				NewWordData("world", 0.5, 1.0, 1),
			},
			wantLen: 0,
			wantErr: true,
		},
		{
			name:       "empty words slice",
			deleteFrom: 0,
			deleteTo:   1,
			words:      []WordData{},
			wantLen:    0,
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			op := NewDeleteOperation(tt.deleteFrom, tt.deleteTo)
			got, err := op.Apply(tt.words)
			if (err != nil) != tt.wantErr {
				t.Errorf("Apply() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && len(got) != tt.wantLen {
				t.Errorf("Apply() got %d words, want %d", len(got), tt.wantLen)
			}
		})
	}
}

func TestDeleteOperation_Undo(t *testing.T) {
	words := []WordData{
		NewWordData("hello", 0.0, 0.5, 0),
		NewWordData("world", 0.5, 1.0, 1),
		NewWordData("test", 1.0, 1.5, 2),
	}

	op := NewDeleteOperation(1, 2)
	result, err := op.Apply(words)
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}

	// Undo should return ErrNotImplemented for now
	_, err = op.Undo(result)
	if err != ErrNotImplemented {
		t.Errorf("Undo() error = %v, want ErrNotImplemented", err)
	}
}

func TestDeleteOperation_MarshalJSON(t *testing.T) {
	op := NewDeleteOperation(1, 3)
	data, err := op.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON() error = %v", err)
	}
	if len(data) == 0 {
		t.Error("MarshalJSON() returned empty data")
	}
	if op.Type() != OperationDelete {
		t.Errorf("Type() = %v, want %v", op.Type(), OperationDelete)
	}
}

func TestDeleteOperation_TimeRange(t *testing.T) {
	words := []WordData{
		NewWordData("hello", 0.0, 0.5, 0),
		NewWordData("world", 0.5, 1.0, 1),
		NewWordData("test", 1.0, 1.5, 2),
		NewWordData("case", 1.5, 2.0, 3),
	}

	op := NewDeleteOperation(1, 3)
	startTime, endTime := op.TimeRange(words)

	if startTime != 0.5 {
		t.Errorf("StartTime() = %v, want 0.5", startTime)
	}
	if endTime != 1.5 {
		t.Errorf("EndTime() = %v, want 1.5", endTime)
	}
}
