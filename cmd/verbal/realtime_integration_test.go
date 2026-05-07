package main

import (
	"testing"

	"verbal/internal/ai/realtime"
	"verbal/internal/ui"
)

func TestAppState_RealtimeTranscriptionFields(t *testing.T) {
	liveCaptionWidget := ui.NewLiveCaptionWidget()
	if liveCaptionWidget == nil {
		t.Error("expected non-nil liveCaptionWidget")
	}

	recordingTranscriber := realtime.NewRecordingTranscriber(realtime.RecordingTranscriberConfig{
		ChunkSize: 4096,
	})
	if recordingTranscriber == nil {
		t.Error("expected non-nil recordingTranscriber")
	}

	if recordingTranscriber.IsActive() {
		t.Error("expected recordingTranscriber to be inactive initially")
	}
}

func TestLiveCaptionWidget_Basic(t *testing.T) {
	widget := ui.NewLiveCaptionWidget()
	if widget == nil {
		t.Fatal("expected non-nil LiveCaptionWidget")
	}

	widget.SetStatus("test status")
	widget.Show()

	if widget.IsMinimized() {
		t.Error("expected widget to not be minimized after Show()")
	}

	widget.Hide()
	if !widget.IsMinimized() {
		t.Error("expected widget to be minimized after Hide()")
	}

	widget.Clear()
}

func TestRecordingTranscriber_Toggle(t *testing.T) {
	rt := realtime.NewRecordingTranscriber(realtime.RecordingTranscriberConfig{
		ChunkSize: 4096,
	})

	if rt.IsActive() {
		t.Error("expected inactive initially")
	}

	mockTranscriber := &mockRealtimeTranscriberForTest{started: false}
	rt.mu.Lock()
	rt.transcriber = mockTranscriber
	rt.mu.Unlock()

	err := rt.Start()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if !rt.IsActive() {
		t.Error("expected active after start")
	}

	err = rt.Stop()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if rt.IsActive() {
		t.Error("expected inactive after stop")
	}
}

type mockRealtimeTranscriberForTest struct {
	started bool
}

func (m *mockRealtimeTranscriberForTest) Start() error {
	m.started = true
	return nil
}

func (m *mockRealtimeTranscriberForTest) Stop() error {
	m.started = false
	return nil
}

func (m *mockRealtimeTranscriberForTest) OnWord(callback func(realtime.WordData)) {
}

func (m *mockRealtimeTranscriberForTest) State() realtime.TranscriberState {
	if m.started {
		return realtime.StateStreaming
	}
	return realtime.StateReady
}