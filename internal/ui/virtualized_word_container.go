package ui

import (
	"sync"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

const DefaultPoolSize = 100

type VirtualizedWordContainer struct {
	flowBox       *gtk.FlowBox
	words         []WordData
	poolSize      int
	pool          []*WordLabel
	visibleStart  int
	visibleEnd    int

	mu                sync.RWMutex
	onWordClick       func(startTime float64, index int)
	onWordHighlight   func(index int)
	lastHighlightedIdx int

	selectionStart int
	selectionEnd   int
	isSelecting   bool
}

func NewVirtualizedWordContainer(words []WordData) *VirtualizedWordContainer {
	flowBox := gtk.NewFlowBox()
	flowBox.SetSelectionMode(gtk.SelectionNone)
	flowBox.SetRowSpacing(4)
	flowBox.SetColumnSpacing(2)
	flowBox.SetHomogeneous(false)
	flowBox.AddCSSClass("word-container")

	vwc := &VirtualizedWordContainer{
		flowBox:            flowBox,
		words:              words,
		poolSize:           DefaultPoolSize,
		pool:               make([]*WordLabel, 0, DefaultPoolSize),
		visibleStart:       -1,
		visibleEnd:         -1,
		lastHighlightedIdx: -1,
		selectionStart:     -1,
		selectionEnd:       -1,
	}

	for i := 0; i < DefaultPoolSize; i++ {
		label := &WordLabel{}
		vwc.pool = append(vwc.pool, label)
	}

	return vwc
}

func (vwc *VirtualizedWordContainer) Widget() *gtk.FlowBox {
	return vwc.flowBox
}

func (vwc *VirtualizedWordContainer) SetWordClickHandler(handler func(startTime float64, index int)) {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	vwc.onWordClick = handler
}

func (vwc *VirtualizedWordContainer) SetHighlightedWord(index int) {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()

	if vwc.lastHighlightedIdx >= 0 && vwc.lastHighlightedIdx < len(vwc.pool) {
		vwc.pool[vwc.lastHighlightedIdx].SetHighlighted(false)
	}

	if index >= 0 && index < len(vwc.words) {
		vwc.pool[index].SetHighlighted(true)
		vwc.lastHighlightedIdx = index
	} else {
		vwc.lastHighlightedIdx = -1
	}
}

func (vwc *VirtualizedWordContainer) GetWordCount() int {
	vwc.mu.RLock()
	defer vwc.mu.RUnlock()
	return len(vwc.words)
}

func (vwc *VirtualizedWordContainer) SetWords(words []WordData) {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	vwc.words = words
}

func (vwc *VirtualizedWordContainer) Clear() {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	vwc.words = vwc.words[:0]
	vwc.visibleStart = -1
	vwc.visibleEnd = -1
}

func (vwc *VirtualizedWordContainer) GetWords() []WordData {
	vwc.mu.RLock()
	defer vwc.mu.RUnlock()
	return vwc.words
}

func (vwc *VirtualizedWordContainer) SetSelectionMode(enabled bool) {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	vwc.isSelecting = enabled
	if !enabled {
		vwc.clearSelection()
	}
}

func (vwc *VirtualizedWordContainer) IsSelectionMode() bool {
	vwc.mu.RLock()
	defer vwc.mu.RUnlock()
	return vwc.isSelecting
}

func (vwc *VirtualizedWordContainer) StartSelection(index int) {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	if index < 0 || index >= len(vwc.words) {
		return
	}
	vwc.selectionStart = index
	vwc.selectionEnd = index
}

func (vwc *VirtualizedWordContainer) ExtendSelection(index int) {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	if index < 0 || index >= len(vwc.words) {
		return
	}
	vwc.selectionEnd = index
}

func (vwc *VirtualizedWordContainer) ClearSelection() {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	vwc.clearSelection()
}

func (vwc *VirtualizedWordContainer) clearSelection() {
	vwc.selectionStart = -1
	vwc.selectionEnd = -1
}

func (vwc *VirtualizedWordContainer) GetSelection() (int, int) {
	vwc.mu.RLock()
	defer vwc.mu.RUnlock()
	start := vwc.selectionStart
	end := vwc.selectionEnd
	if start > end {
		start, end = end, start
	}
	return start, end
}

func (vwc *VirtualizedWordContainer) HasSelection() bool {
	vwc.mu.RLock()
	defer vwc.mu.RUnlock()
	return vwc.selectionStart >= 0 && vwc.selectionEnd >= 0
}

func (vwc *VirtualizedWordContainer) SetSelectionChangedHandler(handler func(start, end int)) {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	_ = handler
}

func (vwc *VirtualizedWordContainer) firstVisibleWordIndex(scrollOffset float64, visibleRatio float64) int {
	if len(vwc.words) == 0 {
		return 0
	}

	duration := vwc.words[len(vwc.words)-1].EndTime
	if duration <= 0 {
		return 0
	}

	targetTime := scrollOffset * duration
	_ = visibleRatio * duration

	low, high := 0, len(vwc.words)-1
	result := low

	for low <= high {
		mid := (low + high) / 2
		wordEnd := vwc.words[mid].EndTime
		if wordEnd <= targetTime {
			result = mid + 1
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	return result
}

func (vwc *VirtualizedWordContainer) lastVisibleWordIndex(scrollOffset float64, visibleRatio float64) int {
	if len(vwc.words) == 0 {
		return 0
	}

	duration := vwc.words[len(vwc.words)-1].EndTime
	if duration <= 0 {
		return len(vwc.words) - 1
	}

	targetTime := scrollOffset * duration
	visibleDuration := visibleRatio * duration
	maxTime := targetTime + visibleDuration

	low, high := 0, len(vwc.words)-1
	result := low

	for low <= high {
		mid := (low + high) / 2
		wordStart := vwc.words[mid].StartTime
		if wordStart < maxTime {
			result = mid
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	return result
}
