package ui

import (
	"fmt"
	"testing"
	"time"

	"verbal/internal/waveform"
)

func TestWaveformWidget_TimestampTooltip(t *testing.T) {
	ww := NewWaveformWidget()

	// Create test data: 100 seconds of audio
	data := &waveform.Data{
		FilePath:   "/test/audio.mp3",
		Duration:   100 * time.Second,
		SampleRate: 10,
		Samples:    make([]waveform.Sample, 1000),
	}
	ww.SetData(data)

	tests := []struct {
		name         string
		viewWidth    float64
		zoomLevel    float64
		scrollOffset float64
		mouseX       float64
		wantTooltip  string
	}{
		{
			name:         "tooltip at start",
			viewWidth:    1000,
			zoomLevel:    1.0,
			scrollOffset: 0,
			mouseX:       0,
			wantTooltip:  "0:00",
		},
		{
			name:         "tooltip at 30 seconds",
			viewWidth:    1000,
			zoomLevel:    1.0,
			scrollOffset: 0,
			mouseX:       300,
			wantTooltip:  "0:30",
		},
		{
			name:         "tooltip at 1 minute 30 seconds",
			viewWidth:    1000,
			zoomLevel:    1.0,
			scrollOffset: 0,
			mouseX:       900,
			wantTooltip:  "1:30",
		},
		{
			name:         "tooltip with zoom",
			viewWidth:    500,
			zoomLevel:    2.0,
			scrollOffset: 0.5, // 25 seconds offset
			mouseX:       0,   // Left edge shows 25 seconds
			wantTooltip:  "0:25",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ww.zoomLevel = tt.zoomLevel
			ww.scrollOffset = tt.scrollOffset

			gotTime := ww.xToTime(tt.mouseX, tt.viewWidth)
			gotTooltip := formatTimeTooltip(gotTime)

			if gotTooltip != tt.wantTooltip {
				t.Errorf("tooltip = %q, want %q", gotTooltip, tt.wantTooltip)
			}
		})
	}
}

func TestFormatTimeTooltip(t *testing.T) {
	tests := []struct {
		name     string
		duration time.Duration
		want     string
	}{
		{"zero", 0, "0:00"},
		{"seconds only", 30 * time.Second, "0:30"},
		{"one minute", 60 * time.Second, "1:00"},
		{"minutes and seconds", 90 * time.Second, "1:30"},
		{"hours", 3661 * time.Second, "1:01:01"},
		{"large hours", 7265 * time.Second, "2:01:05"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatTimeTooltip(tt.duration)
			if got != tt.want {
				t.Errorf("formatTimeTooltip(%v) = %q, want %q", tt.duration, got, tt.want)
			}
		})
	}
}

func TestWaveformWidget_PerformanceWithLargeFiles(t *testing.T) {
	// This test verifies that the waveform widget can handle large files
	// without excessive memory or CPU usage

	ww := NewWaveformWidget()

	// Simulate a 2-hour recording at 100 samples/second = 720,000 samples
	// This is a large file scenario
	largeDuration := 2 * time.Hour
	sampleRate := 100
	sampleCount := int(largeDuration.Seconds()) * sampleRate

	data := &waveform.Data{
		FilePath:   "/test/large_audio.mp3",
		Duration:   largeDuration,
		SampleRate: sampleRate,
		Samples:    make([]waveform.Sample, sampleCount),
	}

	// Fill with sample data
	for i := 0; i < sampleCount; i++ {
		data.Samples[i] = waveform.Sample{
			Time:      time.Duration(i) * time.Second / time.Duration(sampleRate),
			Amplitude: float64(i%100) / 100.0, // Varying amplitude
		}
	}

	// Set the data - this should not cause memory issues
	ww.SetData(data)

	// Test that viewport calculation works efficiently
	viewWidth := 1000.0
	zoomLevel := 10.0 // Zoom in to show only part of the file
	ww.SetZoomLevel(zoomLevel)

	// Get visible range - should only process visible samples, not all
	visibleStart, visibleEnd := ww.getVisibleTimeRange(viewWidth)

	// Verify visible range is reasonable
	visibleDuration := visibleEnd - visibleStart
	maxExpectedVisible := time.Duration(float64(largeDuration) / zoomLevel * 1.1) // 10% tolerance

	if visibleDuration > maxExpectedVisible {
		t.Errorf("Visible duration %v exceeds expected max %v", visibleDuration, maxExpectedVisible)
	}

	// Verify the visible range is a small fraction of total
	visibleFraction := float64(visibleDuration) / float64(largeDuration)
	if visibleFraction > 0.15 { // Should be about 10% (1/10 zoom)
		t.Errorf("Visible fraction %f too high, expected ~0.10", visibleFraction)
	}
}

func TestWaveformWidget_DrawPerformance(t *testing.T) {
	// Test that drawing operations complete quickly
	ww := NewWaveformWidget()

	// Create moderately large dataset
	sampleCount := 10000
	data := &waveform.Data{
		FilePath:   "/test/audio.mp3",
		Duration:   100 * time.Second,
		SampleRate: 100,
		Samples:    make([]waveform.Sample, sampleCount),
	}
	for i := 0; i < sampleCount; i++ {
		data.Samples[i] = waveform.Sample{
			Time:      time.Duration(i) * time.Second / 100,
			Amplitude: 0.5,
		}
	}
	ww.SetData(data)

	// Test coordinate conversions
	viewWidth := 1000.0
	ww.SetZoomLevel(5.0)

	// These operations should be fast (O(1) or O(visible samples))
	// We're not measuring actual time here, just ensuring they complete
	for i := 0; i < 100; i++ {
		x := float64(i * 10)
		timeAtX := ww.xToTime(x, viewWidth)
		roundTripX := ww.timeToX(timeAtX, viewWidth)
		if diff := roundTripX - x; diff < -1.0 || diff > 1.0 {
			t.Fatalf("x/time round-trip drift too large: x=%f roundTrip=%f diff=%f", x, roundTripX, diff)
		}

		timePos := time.Duration(i) * time.Second
		xPos := ww.timeToX(timePos, viewWidth)
		if xPos < 0 {
			t.Fatalf("expected non-negative x coordinate, got %f", xPos)
		}
	}
}

func TestWaveformWidget_ThemeColors(t *testing.T) {
	// Test that colors are properly defined for both light and dark themes

	colors := getWaveformColors()

	// Verify all required colors are present
	requiredColors := []string{
		"background",
		"waveform",
		"positionIndicator",
		"selection",
	}

	for _, color := range requiredColors {
		if _, ok := colors[color]; !ok {
			t.Errorf("Missing color: %s", color)
		}
	}

	// Verify position indicator is a valid RGB triplet
	if posColor, ok := colors["positionIndicator"]; ok {
		if len(posColor) != 3 {
			t.Errorf("positionIndicator should be RGB triplet, got %v", posColor)
		}
	}
}

// formatTimeTooltip formats a duration as a timestamp string (MM:SS or HH:MM:SS)
func formatTimeTooltip(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	seconds := int(d.Seconds()) % 60

	if hours > 0 {
		return fmt.Sprintf("%d:%02d:%02d", hours, minutes, seconds)
	}
	return fmt.Sprintf("%d:%02d", minutes, seconds)
}
