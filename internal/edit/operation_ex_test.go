package edit

import (
	"testing"
)

func TestReorderOperation_Apply(t *testing.T) {
	tests := []struct {
		name          string
		from          int
		to            int
		sourceIndices []int
		words         []WordData
		wantErr       bool
	}{
		{
			name:          "reorder single word",
			from:          0,
			to:            3,
			sourceIndices: []int{0},
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
				NewWordData("world", 0.5, 1.0, 1),
				NewWordData("test", 1.0, 1.5, 2),
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			op := NewReorderOperation(tt.from, tt.to, tt.sourceIndices)
			_, err := op.Apply(tt.words)
			if (err != nil) != tt.wantErr {
				t.Errorf("Apply() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestInsertSilenceOperation_Apply(t *testing.T) {
	tests := []struct {
		name       string
		position   int
		duration   float64
		words      []WordData
		wantLen    int
		wantErr    bool
	}{
		{
			name:       "insert silence at position",
			position:   1,
			duration:   0.5,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
				NewWordData("world", 0.5, 1.0, 1),
				NewWordData("test", 1.0, 1.5, 2),
			},
			wantLen: 5,
			wantErr: false,
		},
		{
			name:       "negative duration",
			position:   1,
			duration:   -0.5,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			op := NewInsertSilenceOperation(tt.position, tt.duration)
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

func TestSplitOperation_Apply(t *testing.T) {
	tests := []struct {
		name      string
		wordIndex int
		words     []WordData
		wantLen   int
		wantErr   bool
	}{
		{
			name:      "split at word boundary",
			wordIndex: 1,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
				NewWordData("world", 0.5, 1.0, 1),
				NewWordData("test", 1.0, 1.5, 2),
			},
			wantLen: 4,
			wantErr: false,
		},
		{
			name:      "split at index 0",
			wordIndex: 0,
			words: []WordData{
				NewWordData("hello", 0.0, 0.5, 0),
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			op := NewSplitOperation(tt.wordIndex)
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
