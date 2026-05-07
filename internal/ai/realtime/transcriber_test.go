package realtime

import (
	"testing"
)

func TestNewRealtimeTranscriber(t *testing.T) {
	rt := NewRealtimeTranscriber()
	if rt == nil {
		t.Fatal("expected non-nil RealtimeTranscriber")
	}
	if rt.State() != StateReady {
		t.Errorf("expected StateReady, got %v", rt.State())
	}
}

func TestRealtimeTranscriber_Start(t *testing.T) {
	rt := NewRealtimeTranscriber()

	err := rt.Start()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if rt.State() != StateStreaming {
		t.Errorf("expected StateStreaming, got %v", rt.State())
	}
}

func TestRealtimeTranscriber_Start_FromStreaming(t *testing.T) {
	rt := NewRealtimeTranscriber()

	rt.Start()
	err := rt.Start()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if rt.State() != StateStreaming {
		t.Errorf("expected StateStreaming, got %v", rt.State())
	}
}

func TestRealtimeTranscriber_Stop(t *testing.T) {
	rt := NewRealtimeTranscriber()

	rt.Start()
	err := rt.Stop()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if rt.State() != StateStopped {
		t.Errorf("expected StateStopped, got %v", rt.State())
	}
}

func TestRealtimeTranscriber_Stop_FromReady(t *testing.T) {
	rt := NewRealtimeTranscriber()

	err := rt.Stop()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if rt.State() != StateReady {
		t.Errorf("expected StateReady, got %v", rt.State())
	}
}

func TestRealtimeTranscriber_OnWord(t *testing.T) {
	rt := NewRealtimeTranscriber()

	var receivedWords []WordData
	rt.OnWord(func(word WordData) {
		receivedWords = append(receivedWords, word)
	})

	word := WordData{Text: "hello", StartTime: 0.0, EndTime: 0.5, Confidence: 0.95}
	rt.emitWord(word)

	if len(receivedWords) != 1 {
		t.Fatalf("expected 1 word, got %d", len(receivedWords))
	}
	if receivedWords[0].Text != "hello" {
		t.Errorf("expected 'hello', got %s", receivedWords[0].Text)
	}
}

func TestRealtimeTranscriber_OnWord_MultipleCallbacks(t *testing.T) {
	rt := NewRealtimeTranscriber()

	var calls []int
	rt.OnWord(func(word WordData) {
		calls = append(calls, 1)
	})
	rt.OnWord(func(word WordData) {
		calls = append(calls, 2)
	})

	rt.emitWord(WordData{Text: "test"})

	if len(calls) != 2 {
		t.Fatalf("expected 2 calls, got %d", len(calls))
	}
}

func TestRealtimeTranscriber_State_Concurrency(t *testing.T) {
	rt := NewRealtimeTranscriber()

	done := make(chan bool)
	go func() {
		for i := 0; i < 100; i++ {
			_ = rt.State()
		}
		done <- true
	}()

	go func() {
		for i := 0; i < 100; i++ {
			rt.Start()
			rt.Stop()
		}
		done <- true
	}()

	<-done
	<-done
}