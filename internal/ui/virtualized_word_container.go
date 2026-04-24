package ui

import (
	"sync"

	"github.com/diamondburned/gotk4/pkg/glib/v2"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

const DefaultPoolSize = 100

type VirtualizedWordContainer struct {
	flowBox       *gtk.FlowBox
	words         []WordData
	poolSize      int
	pool          []*WordLabel
	attachedCount int

	mu sync.RWMutex

	onWordClick        func(startTime float64, index int)
	onWordHighlight    func(index int)
	onSelectionChanged func(start, end int)
	highlightedPoolIdx int
	highlightedWordIdx int

	selectionStart int
	selectionEnd   int
	isSelecting    bool

	scrollOffset float64
	visibleRatio float64
}

func NewVirtualizedWordContainer(words []WordData) *VirtualizedWordContainer {
	flowBox := gtk.NewFlowBox()
	flowBox.SetSelectionMode(gtk.SelectionNone)
	flowBox.SetRowSpacing(4)
	flowBox.SetColumnSpacing(2)
	flowBox.SetHomogeneous(false)
	flowBox.AddCSSClass("word-container")

	pool := make([]*WordLabel, DefaultPoolSize)
	for i := range pool {
		pool[i] = NewWordLabel(WordData{Text: ""})
		pool[i].SetVisible(false)
	}

	vwc := &VirtualizedWordContainer{
		flowBox:            flowBox,
		words:              words,
		poolSize:           DefaultPoolSize,
		pool:               pool,
		attachedCount:      0,
		scrollOffset:       0,
		visibleRatio:       0.1,
		highlightedPoolIdx: -1,
		highlightedWordIdx: -1,
		selectionStart:     -1,
		selectionEnd:       -1,
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

	if vwc.highlightedPoolIdx >= 0 && vwc.highlightedPoolIdx < len(vwc.pool) {
		vwc.pool[vwc.highlightedPoolIdx].SetHighlighted(false)
	}

	if index < 0 || index >= len(vwc.words) {
		vwc.highlightedPoolIdx = -1
		vwc.highlightedWordIdx = -1
		return
	}

	scrollOffset := vwc.scrollOffset
	visibleRatio := vwc.visibleRatio
	words := vwc.words
	startIdx := vwc.firstVisibleWordIndex(words, scrollOffset, visibleRatio)
	endIdx := vwc.lastVisibleWordIndex(words, scrollOffset, visibleRatio)
	visibleCount := endIdx - startIdx + 1
	if visibleCount > vwc.poolSize {
		visibleCount = vwc.poolSize
	}

	if index < startIdx || index > endIdx {
		vwc.highlightedPoolIdx = -1
		vwc.highlightedWordIdx = index
		return
	}

	poolIdx := index - startIdx
	if poolIdx >= 0 && poolIdx < visibleCount && poolIdx < len(vwc.pool) {
		vwc.pool[poolIdx].SetHighlighted(true)
		vwc.highlightedPoolIdx = poolIdx
		vwc.highlightedWordIdx = index
	} else {
		vwc.highlightedPoolIdx = -1
		vwc.highlightedWordIdx = index
	}
}

func (vwc *VirtualizedWordContainer) GetWordCount() int {
	vwc.mu.RLock()
	defer vwc.mu.RUnlock()
	return len(vwc.words)
}

func (vwc *VirtualizedWordContainer) GetHighlightedWord() int {
	vwc.mu.RLock()
	defer vwc.mu.RUnlock()
	return vwc.highlightedWordIdx
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
	vwc.scrollOffset = 0
}

func (vwc *VirtualizedWordContainer) GetWords() []WordData {
	vwc.mu.RLock()
	defer vwc.mu.RUnlock()
	return vwc.words
}

func (vwc *VirtualizedWordContainer) UpdateViewport(scrollOffset, visibleRatio float64) {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	vwc.scrollOffset = scrollOffset
	vwc.visibleRatio = visibleRatio
}

func (vwc *VirtualizedWordContainer) UpdateVisibleWidgets() {
	vwc.mu.Lock()
	scrollOffset := vwc.scrollOffset
	visibleRatio := vwc.visibleRatio
	words := vwc.words
	poolSize := vwc.poolSize
	vwc.mu.Unlock()

	if len(words) == 0 {
		return
	}

	startIdx := vwc.firstVisibleWordIndex(words, scrollOffset, visibleRatio)
	endIdx := vwc.lastVisibleWordIndex(words, scrollOffset, visibleRatio)

	if startIdx > endIdx {
		return
	}

	visibleCount := endIdx - startIdx + 1
	if visibleCount > poolSize {
		visibleCount = poolSize
		endIdx = startIdx + visibleCount - 1
	}

	vwc.mu.Lock()
	vwc.attachedCount = visibleCount
	vwc.mu.Unlock()

	glib.IdleAdd(func() bool {
		vwc.mu.Lock()
		currentAttached := vwc.attachedCount
		currentPool := vwc.pool
		currentFlowBox := vwc.flowBox
		currentWords := vwc.words
		currentStartIdx := vwc.firstVisibleWordIndex(currentWords, vwc.scrollOffset, vwc.visibleRatio)
		vwc.mu.Unlock()

		currentFlowBox.RemoveAll()

		for i := 0; i < currentAttached && i < len(currentPool); i++ {
			wordIdx := currentStartIdx + i
			if wordIdx < len(currentWords) {
				wordData := currentWords[wordIdx]
				wordData.Index = wordIdx
				currentPool[i].SetData(wordData)
				currentPool[i].SetHighlighted(false)
				currentPool[i].SetVisible(true)
				currentFlowBox.Append(currentPool[i].Widget())
			}
		}

		return false
	})
}

func (vwc *VirtualizedWordContainer) BindScrollEvents(scrolledWindow *gtk.ScrolledWindow) {
	vscrolled := scrolledWindow.VAdjustment()
	if vscrolled == nil {
		return
	}

	vscrolled.ConnectValueChanged(func() {
		value := vscrolled.Value()
		upper := vscrolled.Upper()
		var scrollOffset float64
		if upper > 0 {
			scrollOffset = value / upper
		} else {
			scrollOffset = 0
		}

		pageSize := vscrolled.PageSize()
		var pageRatio float64
		if upper > 0 {
			pageRatio = pageSize / upper
		} else {
			pageRatio = 0
		}

		vwc.UpdateViewport(scrollOffset, pageRatio)
		vwc.UpdateVisibleWidgets()
	})
}

func (vwc *VirtualizedWordContainer) GetPoolSize() int {
	vwc.mu.RLock()
	defer vwc.mu.RUnlock()
	return vwc.poolSize
}

func (vwc *VirtualizedWordContainer) GetAttachedCount() int {
	vwc.mu.RLock()
	defer vwc.mu.RUnlock()
	return vwc.attachedCount
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
	vwc.notifySelectionChanged()
}

func (vwc *VirtualizedWordContainer) ExtendSelection(index int) {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	if index < 0 || index >= len(vwc.words) {
		return
	}
	vwc.selectionEnd = index
	vwc.notifySelectionChanged()
}

func (vwc *VirtualizedWordContainer) ClearSelection() {
	vwc.mu.Lock()
	defer vwc.mu.Unlock()
	vwc.clearSelection()
}

func (vwc *VirtualizedWordContainer) clearSelection() {
	vwc.selectionStart = -1
	vwc.selectionEnd = -1
	vwc.notifySelectionChanged()
}

func (vwc *VirtualizedWordContainer) notifySelectionChanged() {
	if vwc.onSelectionChanged != nil {
		start := vwc.selectionStart
		end := vwc.selectionEnd
		if start > end {
			start, end = end, start
		}
		vwc.onSelectionChanged(start, end)
	}
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
	vwc.onSelectionChanged = handler
}

func (vwc *VirtualizedWordContainer) firstVisibleWordIndex(words []WordData, scrollOffset float64, visibleRatio float64) int {
	if len(words) == 0 {
		return 0
	}

	duration := words[len(words)-1].EndTime
	if duration <= 0 {
		return 0
	}

	targetTime := scrollOffset * duration

	low, high := 0, len(words)-1
	result := low

	for low <= high {
		mid := (low + high) / 2
		wordEnd := words[mid].EndTime
		if wordEnd <= targetTime {
			result = mid + 1
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	return result
}

func (vwc *VirtualizedWordContainer) lastVisibleWordIndex(words []WordData, scrollOffset float64, visibleRatio float64) int {
	if len(words) == 0 {
		return 0
	}

	duration := words[len(words)-1].EndTime
	if duration <= 0 {
		return len(words) - 1
	}

	targetTime := scrollOffset * duration
	visibleDuration := visibleRatio * duration
	maxTime := targetTime + visibleDuration

	low, high := 0, len(words)-1
	result := low

	for low <= high {
		mid := (low + high) / 2
		wordStart := words[mid].StartTime
		if wordStart < maxTime {
			result = mid
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	return result
}
