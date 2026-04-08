package ui

import (
	"testing"
	"time"

	"verbal/internal/waveform"
)

func TestWaveformWidget_ScrollOffset(t *testing.T) {
	ww := NewWaveformWidget()

	// Create test data: 100 seconds of audio at 10 samples/sec = 1000 samples
	data := &waveform.Data{
		FilePath:   "/test/audio.mp3",
		Duration:   100 * time.Second,
		SampleRate: 10,
		Samples:    make([]waveform.Sample, 1000),
	}
	for i := 0; i < 1000; i++ {
		data.Samples[i] = waveform.Sample{
			Time:      time.Duration(i) * 100 * time.Millisecond,
			Amplitude: 0.5,
		}
	}
	ww.SetData(data)

	tests := []struct {
		name             string
		viewWidth        float64
		zoomLevel        float64
		scrollOffset     float64
		wantVisibleStart time.Duration
		wantVisibleEnd   time.Duration
	}{
		{
			name:             "no scroll needed - zoomed out",
			viewWidth:        1000,
			zoomLevel:        1.0,
			scrollOffset:     0,
			wantVisibleStart: 0,
			wantVisibleEnd:   100 * time.Second,
		},
		{
			name:             "scrolled to middle",
			viewWidth:        500,
			zoomLevel:        2.0, // 2x zoom = 50 seconds visible
			scrollOffset:     0.5, // 50% scroll
			wantVisibleStart: 25 * time.Second,
			wantVisibleEnd:   75 * time.Second,
		},
		{
			name:             "scrolled to end",
			viewWidth:        500,
			zoomLevel:        2.0,
			scrollOffset:     1.0, // 100% scroll
			wantVisibleStart: 50 * time.Second,
			wantVisibleEnd:   100 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ww.zoomLevel = tt.zoomLevel
			ww.scrollOffset = tt.scrollOffset

			gotStart, gotEnd := ww.getVisibleTimeRange(tt.viewWidth)

			if gotStart != tt.wantVisibleStart {
				t.Errorf("visible start = %v, want %v", gotStart, tt.wantVisibleStart)
			}
			if gotEnd != tt.wantVisibleEnd {
				t.Errorf("visible end = %v, want %v", gotEnd, tt.wantVisibleEnd)
			}
		})
	}
}

func TestWaveformWidget_ZoomLevel(t *testing.T) {
	ww := NewWaveformWidget()

	tests := []struct {
		name        string
		initialZoom float64
		setZoom     float64
		wantZoom    float64
		wantMinZoom float64
		wantMaxZoom float64
	}{
		{
			name:        "default zoom is 1.0",
			initialZoom: 1.0,
			setZoom:     1.0,
			wantZoom:    1.0,
			wantMinZoom: 0.1,
			wantMaxZoom: 10.0,
		},
		{
			name:        "zoom in",
			initialZoom: 1.0,
			setZoom:     2.0,
			wantZoom:    2.0,
			wantMinZoom: 0.1,
			wantMaxZoom: 10.0,
		},
		{
			name:        "zoom out",
			initialZoom: 1.0,
			setZoom:     0.5,
			wantZoom:    0.5,
			wantMinZoom: 0.1,
			wantMaxZoom: 10.0,
		},
		{
			name:        "zoom clamped to minimum",
			initialZoom: 1.0,
			setZoom:     0.01, // Below min
			wantZoom:    0.1,  // Should be clamped
			wantMinZoom: 0.1,
			wantMaxZoom: 10.0,
		},
		{
			name:        "zoom clamped to maximum",
			initialZoom: 1.0,
			setZoom:     100.0, // Above max
			wantZoom:    10.0,  // Should be clamped
			wantMinZoom: 0.1,
			wantMaxZoom: 10.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ww.SetZoomLevel(tt.setZoom)

			if ww.zoomLevel != tt.wantZoom {
				t.Errorf("zoom level = %v, want %v", ww.zoomLevel, tt.wantZoom)
			}
			if ww.minZoom != tt.wantMinZoom {
				t.Errorf("min zoom = %v, want %v", ww.minZoom, tt.wantMinZoom)
			}
			if ww.maxZoom != tt.wantMaxZoom {
				t.Errorf("max zoom = %v, want %v", ww.maxZoom, tt.wantMaxZoom)
			}
		})
	}
}

func TestWaveformWidget_TimeRangeSelection(t *testing.T) {
	ww := NewWaveformWidget()

	// Create test data
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
		dragStartX   float64
		dragEndX     float64
		wantStart    time.Duration
		wantEnd      time.Duration
	}{
		{
			name:         "select first 10 seconds",
			viewWidth:    1000,
			zoomLevel:    1.0,
			scrollOffset: 0,
			dragStartX:   0,
			dragEndX:     100, // 10% of width = 10 seconds
			wantStart:    0,
			wantEnd:      10 * time.Second,
		},
		{
			name:         "select with scroll offset",
			viewWidth:    500,
			zoomLevel:    2.0, // 50 seconds visible
			scrollOffset: 0.5, // 25 seconds offset
			dragStartX:   0,   // At scroll offset
			dragEndX:     250, // Half of visible area = 25 seconds
			wantStart:    25 * time.Second,
			wantEnd:      50 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ww.zoomLevel = tt.zoomLevel
			ww.scrollOffset = tt.scrollOffset
			ww.selectStart = ww.xToTime(tt.dragStartX, tt.viewWidth)
			ww.selectEnd = ww.xToTime(tt.dragEndX, tt.viewWidth)

			gotStart, gotEnd := ww.GetSelection()

			// Allow small tolerance for floating point math
			tolerance := 100 * time.Millisecond
			if gotStart < tt.wantStart-tolerance || gotStart > tt.wantStart+tolerance {
				t.Errorf("selection start = %v, want %v", gotStart, tt.wantStart)
			}
			if gotEnd < tt.wantEnd-tolerance || gotEnd > tt.wantEnd+tolerance {
				t.Errorf("selection end = %v, want %v", gotEnd, tt.wantEnd)
			}
		})
	}
}

func TestWaveformWidget_TimeToX(t *testing.T) {
	ww := NewWaveformWidget()

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
		timePos      time.Duration
		wantX        float64
	}{
		{
			name:         "start at 0 offset",
			viewWidth:    1000,
			zoomLevel:    1.0,
			scrollOffset: 0,
			timePos:      0,
			wantX:        0,
		},
		{
			name:         "middle at 1x zoom",
			viewWidth:    1000,
			zoomLevel:    1.0,
			scrollOffset: 0,
			timePos:      50 * time.Second,
			wantX:        500,
		},
		{
			name:         "with scroll offset",
			viewWidth:    500,
			zoomLevel:    2.0,
			scrollOffset: 0.5, // 25 seconds offset
			timePos:      25 * time.Second,
			wantX:        0, // Should be at left edge due to scroll
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ww.zoomLevel = tt.zoomLevel
			ww.scrollOffset = tt.scrollOffset

			gotX := ww.timeToX(tt.timePos, tt.viewWidth)

			tolerance := 1.0 // Allow 1 pixel tolerance
			if gotX < tt.wantX-tolerance || gotX > tt.wantX+tolerance {
				t.Errorf("x position = %v, want %v", gotX, tt.wantX)
			}
		})
	}
}

func TestWaveformWidget_XToTime(t *testing.T) {
	ww := NewWaveformWidget()

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
		x            float64
		wantTime     time.Duration
	}{
		{
			name:         "left edge",
			viewWidth:    1000,
			zoomLevel:    1.0,
			scrollOffset: 0,
			x:            0,
			wantTime:     0,
		},
		{
			name:         "middle at 1x zoom",
			viewWidth:    1000,
			zoomLevel:    1.0,
			scrollOffset: 0,
			x:            500,
			wantTime:     50 * time.Second,
		},
		{
			name:         "with 2x zoom",
			viewWidth:    500,
			zoomLevel:    2.0,
			scrollOffset: 0,
			x:            250,
			wantTime:     25 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ww.zoomLevel = tt.zoomLevel
			ww.scrollOffset = tt.scrollOffset

			gotTime := ww.xToTime(tt.x, tt.viewWidth)

			tolerance := 100 * time.Millisecond
			if gotTime < tt.wantTime-tolerance || gotTime > tt.wantTime+tolerance {
				t.Errorf("time = %v, want %v", gotTime, tt.wantTime)
			}
		})
	}
}
