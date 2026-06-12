package domain

import (
	"strings"
	"testing"
	"time"
)

func TestNewSegment(t *testing.T) {
	tests := []struct {
		name        string
		start       time.Duration
		end         time.Duration
		wantErr     bool
		errContains string
	}{
		{
			name:    "valid segment",
			start:   time.Second,
			end:     5 * time.Second,
			wantErr: false,
		},
		{
			name:        "negative start",
			start:       -time.Second,
			end:         5 * time.Second,
			wantErr:     true,
			errContains: "start must be non-negative",
		},
		{
			name:        "end before start",
			start:       5 * time.Second,
			end:         time.Second,
			wantErr:     true,
			errContains: "end",
		},
		{
			name:        "end equals start",
			start:       time.Second,
			end:         time.Second,
			wantErr:     true,
			errContains: "end",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, err := NewSegment(tt.start, tt.end)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.errContains)
				}
				if tt.errContains != "" && !strings.Contains(err.Error(), tt.errContains) {
					t.Fatalf("expected error containing %q, got %q", tt.errContains, err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if s.Start != tt.start || s.End != tt.end {
				t.Errorf("Segment = {%v, %v}, want {%v, %v}", s.Start, s.End, tt.start, tt.end)
			}
			if s.Duration() != tt.end-tt.start {
				t.Errorf("Duration = %v, want %v", s.Duration(), tt.end-tt.start)
			}
		})
	}
}

func TestSegmentFromWords(t *testing.T) {
	w1, _ := NewWord("hello", time.Second, 2*time.Second, nil)
	w2, _ := NewWord("world", 2*time.Second, 3*time.Second, nil)
	w3, _ := NewWord("out", 500*time.Millisecond, 750*time.Millisecond, nil)

	tests := []struct {
		name        string
		words       []Word
		wantStart   time.Duration
		wantEnd     time.Duration
		wantErr     bool
		errContains string
	}{
		{
			name:      "single word",
			words:     []Word{w1},
			wantStart: w1.Start,
			wantEnd:   w1.End,
		},
		{
			name:      "multiple ordered words",
			words:     []Word{w1, w2},
			wantStart: w1.Start,
			wantEnd:   w2.End,
		},
		{
			name:        "empty words",
			words:       []Word{},
			wantErr:     true,
			errContains: "at least one word",
		},
		{
			name:        "unordered words",
			words:       []Word{w1, w3},
			wantErr:     true,
			errContains: "ordered",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, err := SegmentFromWords(tt.words)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.errContains)
				}
				if tt.errContains != "" && !strings.Contains(err.Error(), tt.errContains) {
					t.Fatalf("expected error containing %q, got %q", tt.errContains, err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if s.Start != tt.wantStart || s.End != tt.wantEnd {
				t.Errorf("Segment = {%v, %v}, want {%v, %v}", s.Start, s.End, tt.wantStart, tt.wantEnd)
			}
		})
	}
}
