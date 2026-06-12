package domain

import (
	"strings"
	"testing"
	"time"
)

func ptr(f float64) *float64 {
	return &f
}

func TestNewWord(t *testing.T) {
	tests := []struct {
		name        string
		text        string
		start       time.Duration
		end         time.Duration
		confidence  *float64
		wantErr     bool
		errContains string
	}{
		{
			name:    "valid word without confidence",
			text:    "hello",
			start:   time.Second,
			end:     2 * time.Second,
			wantErr: false,
		},
		{
			name:       "valid word with confidence",
			text:       "hello",
			start:      time.Second,
			end:        2 * time.Second,
			confidence: ptr(0.95),
			wantErr:    false,
		},
		{
			name:        "empty text",
			text:        "",
			start:       time.Second,
			end:         2 * time.Second,
			wantErr:     true,
			errContains: "text is required",
		},
		{
			name:        "negative start",
			text:        "hello",
			start:       -time.Second,
			end:         2 * time.Second,
			wantErr:     true,
			errContains: "start must be non-negative",
		},
		{
			name:        "end before start",
			text:        "hello",
			start:       2 * time.Second,
			end:         time.Second,
			wantErr:     true,
			errContains: "end",
		},
		{
			name:        "end equals start",
			text:        "hello",
			start:       time.Second,
			end:         time.Second,
			wantErr:     true,
			errContains: "end",
		},
		{
			name:        "confidence below zero",
			text:        "hello",
			start:       time.Second,
			end:         2 * time.Second,
			confidence:  ptr(-0.1),
			wantErr:     true,
			errContains: "confidence",
		},
		{
			name:        "confidence above one",
			text:        "hello",
			start:       time.Second,
			end:         2 * time.Second,
			confidence:  ptr(1.1),
			wantErr:     true,
			errContains: "confidence",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w, err := NewWord(tt.text, tt.start, tt.end, tt.confidence)
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
			if w.Text != tt.text {
				t.Errorf("Text = %q, want %q", w.Text, tt.text)
			}
			if w.Start != tt.start {
				t.Errorf("Start = %v, want %v", w.Start, tt.start)
			}
			if w.End != tt.end {
				t.Errorf("End = %v, want %v", w.End, tt.end)
			}
			if w.Duration() != tt.end-tt.start {
				t.Errorf("Duration = %v, want %v", w.Duration(), tt.end-tt.start)
			}
		})
	}
}
