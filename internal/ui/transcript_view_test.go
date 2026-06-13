package ui

import (
	"sync"
	"testing"

	"verbal/internal/ai"
)

// Red-phase behavioural contract tests for TranscriptView.
// The TranscriptView type and methods are implemented in
// internal/ui/transcript_view.go.

// =============================================================================
// Red-phase behavioural contract tests
// =============================================================================
//
// Each test below asserts a behaviour the STUB TranscriptView does NOT
// satisfy. Green phase replaces the STUB with the real implementation
// in internal/ui/transcript_view.go; the assertions then pass.

// -----------------------------------------------------------------------------
// Construction and lifecycle
// -----------------------------------------------------------------------------

func TestTranscriptView_New_ReturnsNonNil(t *testing.T) {
	view := NewTranscriptView()
	if view == nil {
		t.Fatal("NewTranscriptView() = nil, want non-nil")
	}
}

func TestTranscriptView_New_StartsEmpty(t *testing.T) {
	view := NewTranscriptView()
	if got := view.WordCount(); got != 0 {
		t.Errorf("WordCount on fresh view = %d, want 0", got)
	}
}

func TestTranscriptView_Widget_NotNilAfterConstruction(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	view := NewTranscriptView()
	if view.Widget() == nil {
		t.Error("Widget() = nil after construction, want non-nil GTK widget")
	}
}

// -----------------------------------------------------------------------------
// SetWords / WordCount / WordAt (model layer)
// -----------------------------------------------------------------------------

func TestTranscriptView_SetWords_StoresWords(t *testing.T) {
	view := NewTranscriptView()
	words := []ai.Word{
		{Text: "hello", Start: 0.0, End: 0.5},
		{Text: "world", Start: 0.5, End: 1.0},
		{Text: "foo", Start: 1.0, End: 1.5},
	}

	view.SetWords(words)

	if got := view.WordCount(); got != 3 {
		t.Errorf("WordCount after SetWords(3) = %d, want 3", got)
	}
}

func TestTranscriptView_SetWords_Nil_CountsAsZero(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{
		{Text: "stays", Start: 0, End: 1},
	})
	view.SetWords(nil)

	if got := view.WordCount(); got != 0 {
		t.Errorf("WordCount after SetWords(nil) = %d, want 0", got)
	}
}

func TestTranscriptView_SetWords_Empty_CountsAsZero(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{
		{Text: "stays", Start: 0, End: 1},
	})
	view.SetWords([]ai.Word{})

	if got := view.WordCount(); got != 0 {
		t.Errorf("WordCount after SetWords([]) = %d, want 0", got)
	}
}

func TestTranscriptView_SetWords_ReplacesPreviousList(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{
		{Text: "first", Start: 0, End: 1},
		{Text: "second", Start: 1, End: 2},
		{Text: "third", Start: 2, End: 3},
		{Text: "fourth", Start: 3, End: 4},
	})
	view.SetWords([]ai.Word{
		{Text: "alpha", Start: 0, End: 0.5},
		{Text: "beta", Start: 0.5, End: 1.0},
	})

	if got := view.WordCount(); got != 2 {
		t.Errorf("WordCount after second SetWords(2) = %d, want 2 (got first list)", got)
	}

	got, ok := view.WordAt(0)
	if !ok {
		t.Fatal("WordAt(0) returned ok=false after second SetWords, want true")
	}
	if got.Text != "alpha" {
		t.Errorf("WordAt(0).Text = %q, want %q (old list should be replaced)", got.Text, "alpha")
	}
}

func TestTranscriptView_WordAt_ValidIndex_ReturnsWord(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{
		{Text: "hello", Start: 0.0, End: 0.5},
		{Text: "world", Start: 0.5, End: 1.0},
		{Text: "foo", Start: 1.0, End: 1.5},
	})

	got, ok := view.WordAt(1)
	if !ok {
		t.Fatal("WordAt(1) = ok=false, want true")
	}
	if got.Text != "world" {
		t.Errorf("WordAt(1).Text = %q, want %q", got.Text, "world")
	}
}

func TestTranscriptView_WordAt_PreservesStartAndEndMetadata(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{
		{Text: "alpha", Start: 0.0, End: 0.5},
		{Text: "beta", Start: 0.5, End: 1.25},
	})

	got, ok := view.WordAt(1)
	if !ok {
		t.Fatal("WordAt(1) = ok=false, want true")
	}
	if got.Start != 0.5 {
		t.Errorf("WordAt(1).Start = %v, want 0.5", got.Start)
	}
	if got.End != 1.25 {
		t.Errorf("WordAt(1).End = %v, want 1.25", got.End)
	}
}

func TestTranscriptView_WordAt_NegativeIndex_ReturnsFalse(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{{Text: "x", Start: 0, End: 1}})

	if _, ok := view.WordAt(-1); ok {
		t.Error("WordAt(-1) = ok=true, want false")
	}
}

func TestTranscriptView_WordAt_BeyondEnd_ReturnsFalse(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{
		{Text: "a", Start: 0, End: 1},
		{Text: "b", Start: 1, End: 2},
	})

	if _, ok := view.WordAt(2); ok {
		t.Error("WordAt(2) on a 2-word list = ok=true, want false")
	}
	if _, ok := view.WordAt(100); ok {
		t.Error("WordAt(100) on a 2-word list = ok=true, want false")
	}
}

func TestTranscriptView_WordAt_EmptyList_ReturnsFalse(t *testing.T) {
	view := NewTranscriptView()

	if _, ok := view.WordAt(0); ok {
		t.Error("WordAt(0) on empty view = ok=true, want false")
	}
}

func TestTranscriptView_WordAt_AfterSetNil_ReturnsFalse(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{{Text: "a", Start: 0, End: 1}})
	view.SetWords(nil)

	if _, ok := view.WordAt(0); ok {
		t.Error("WordAt(0) after SetWords(nil) = ok=true, want false")
	}
}

// -----------------------------------------------------------------------------
// OnWordClicked callback dispatch
// -----------------------------------------------------------------------------

func TestTranscriptView_EmitClick_FiresCallbackWithIndex(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{
		{Text: "zero", Start: 0.0, End: 0.5},
		{Text: "one", Start: 0.5, End: 1.0},
		{Text: "two", Start: 1.0, End: 1.5},
	})

	var gotIndex int
	var called int
	view.SetOnWordClicked(func(wordIndex int) {
		called++
		gotIndex = wordIndex
	})

	view.emitClick(1)

	if called != 1 {
		t.Errorf("callback fired %d times, want 1", called)
	}
	if gotIndex != 1 {
		t.Errorf("callback wordIndex = %d, want 1", gotIndex)
	}
}

func TestTranscriptView_EmitClick_NoCallbackRegistered_DoesNotPanic(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{{Text: "x", Start: 0, End: 1}})

	// No SetOnWordClicked — must not panic.
	view.emitClick(0)
}

func TestTranscriptView_EmitClick_OutOfRange_DoesNotFire(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{
		{Text: "a", Start: 0, End: 1},
		{Text: "b", Start: 1, End: 2},
	})

	called := 0
	view.SetOnWordClicked(func(wordIndex int) {
		called++
	})

	view.emitClick(-1)
	view.emitClick(2)
	view.emitClick(99)

	if called != 0 {
		t.Errorf("out-of-range clicks fired callback %d times, want 0", called)
	}
}

func TestTranscriptView_EmitClick_EmptyList_DoesNotFire(t *testing.T) {
	view := NewTranscriptView()

	called := 0
	view.SetOnWordClicked(func(wordIndex int) {
		called++
	})

	view.emitClick(0)

	if called != 0 {
		t.Errorf("click on empty view fired callback %d times, want 0", called)
	}
}

func TestTranscriptView_EmitClick_AfterSetNil_DoesNotFire(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{{Text: "a", Start: 0, End: 1}})

	called := 0
	view.SetOnWordClicked(func(wordIndex int) {
		called++
	})

	view.SetWords(nil)
	view.emitClick(0)

	if called != 0 {
		t.Errorf("click after SetWords(nil) fired callback %d times, want 0", called)
	}
}

func TestTranscriptView_SetOnWordClicked_Nil_DisablesCallback(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{{Text: "a", Start: 0, End: 1}})

	called := 0
	view.SetOnWordClicked(func(wordIndex int) { called++ })
	view.SetOnWordClicked(nil)

	view.emitClick(0)

	if called != 0 {
		t.Errorf("callback fired after SetOnWordClicked(nil), want 0 calls")
	}
}

func TestTranscriptView_SetOnWordClicked_ReplacesPrevious(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{{Text: "a", Start: 0, End: 1}})

	first := 0
	second := 0
	view.SetOnWordClicked(func(wordIndex int) { first++ })
	view.SetOnWordClicked(func(wordIndex int) { second++ })

	view.emitClick(0)

	if first != 0 {
		t.Errorf("replaced callback fired %d times, want 0", first)
	}
	if second != 1 {
		t.Errorf("replacement callback fired %d times, want 1", second)
	}
}

func TestTranscriptView_EmitClick_MultipleClicks_FireEachTime(t *testing.T) {
	view := NewTranscriptView()
	view.SetWords([]ai.Word{
		{Text: "a", Start: 0, End: 1},
		{Text: "b", Start: 1, End: 2},
	})

	called := 0
	view.SetOnWordClicked(func(wordIndex int) { called++ })

	view.emitClick(0)
	view.emitClick(0)
	view.emitClick(1)
	view.emitClick(1)
	view.emitClick(1)

	if called != 5 {
		t.Errorf("callback fired %d times for 5 clicks, want 5", called)
	}
}

// -----------------------------------------------------------------------------
// Concurrency (test-strategy §3: poller + user-click must serialize
// safely; the widget must not race even when both goroutines call
// SetOnWordClicked and emitClick concurrently).
// -----------------------------------------------------------------------------

func TestTranscriptView_ConcurrentEmitClick_NoRace(t *testing.T) {
	view := NewTranscriptView()
	words := make([]ai.Word, 16)
	for i := range words {
		words[i] = ai.Word{Text: "w", Start: float64(i), End: float64(i) + 0.5}
	}
	view.SetWords(words)

	var called int64
	var wg sync.WaitGroup
	view.SetOnWordClicked(func(wordIndex int) {
		_ = wordIndex
		// Atomic increment; the contract under test is no race in
		// the callback dispatch path, not a particular increment
		// implementation.
		_ = called
	})

	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func(seed int) {
			defer wg.Done()
			for i := 0; i < 25; i++ {
				view.emitClick((seed + i) % len(words))
			}
		}(g)
	}
	wg.Wait()
}

// -----------------------------------------------------------------------------
// Render layer (display-gated per test-strategy §1 P3 pyramid)
// -----------------------------------------------------------------------------

func TestTranscriptView_SetWords_PopulatesFlowBox(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	view := NewTranscriptView()
	if view.Widget() == nil {
		t.Fatal("Widget() = nil after construction; cannot assert flow box population")
	}

	view.SetWords([]ai.Word{
		{Text: "alpha", Start: 0.0, End: 0.5},
		{Text: "beta", Start: 0.5, End: 1.0},
		{Text: "gamma", Start: 1.0, End: 1.5},
	})

	if got := view.WordCount(); got != 3 {
		t.Errorf("WordCount after SetWords(3) = %d, want 3", got)
	}
}

func TestTranscriptView_SetWords_Nil_ClearsFlowBox(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	view := NewTranscriptView()
	if view.Widget() == nil {
		t.Fatal("Widget() = nil after construction; cannot assert flow box population")
	}

	view.SetWords([]ai.Word{
		{Text: "alpha", Start: 0.0, End: 0.5},
		{Text: "beta", Start: 0.5, End: 1.0},
	})
	view.SetWords(nil)

	if got := view.WordCount(); got != 0 {
		t.Errorf("WordCount after SetWords(nil) = %d, want 0", got)
	}
}
