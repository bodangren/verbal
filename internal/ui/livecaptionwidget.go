package ui

import (
	"sync"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/ai"
)

type LiveCaptionWidget struct {
	box *gtk.Box

	captionLabel *gtk.Label
	statusLabel  *gtk.Label
	wordFlowBox  *gtk.FlowBox

	words       []ai.Word
	currentWord int
	minimized   bool

	onWordSelected func(word ai.Word)
	onMinimized    func()
	onRestored     func()

	mu sync.RWMutex
}

func NewLiveCaptionWidget() *LiveCaptionWidget {
	box := gtk.NewBox(gtk.OrientationVertical, 8)
	box.AddCSSClass("live-caption-panel")
	box.SetMarginStart(12)
	box.SetMarginEnd(12)
	box.SetMarginTop(8)
	box.SetMarginBottom(8)
	box.SetHAlign(gtk.AlignFill)
	box.SetSizeRequest(-1, 120)

	headerBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	headerBox.SetHAlign(gtk.AlignFill)

	titleLabel := gtk.NewLabel("Live Caption")
	titleLabel.AddCSSClass("settings-title")
	titleLabel.SetHAlign(gtk.AlignStart)
	headerBox.Append(titleLabel)

	statusIndicator := gtk.NewLabel("")
	statusIndicator.AddCSSClass("caption-status")
	statusIndicator.SetHAlign(gtk.AlignEnd)
	headerBox.Append(statusIndicator)

	box.Append(headerBox)

	statusLabel := gtk.NewLabel("Starting...")
	statusLabel.AddCSSClass("text-secondary")
	statusLabel.SetHAlign(gtk.AlignStart)
	statusLabel.SetMarginStart(4)
	statusLabel.SetMarginBottom(4)
	box.Append(statusLabel)

	scrolledWindow := gtk.NewScrolledWindow()
	scrolledWindow.SetPolicy(gtk.PolicyNever, gtk.PolicyAutomatic)
	scrolledWindow.SetMaxContentHeight(80)
	scrolledWindow.SetHAlign(gtk.AlignFill)

	wordFlowBox := gtk.NewFlowBox()
	wordFlowBox.SetHAlign(gtk.AlignFill)
	wordFlowBox.SetMaxChildrenPerLine(20)
	wordFlowBox.SetSelectionMode(gtk.SelectionNone)
	scrolledWindow.SetChild(wordFlowBox)

	box.Append(scrolledWindow)

	minimizeButton := gtk.NewButton()
	minimizeButton.SetLabel("Minimize")
	minimizeButton.SetHAlign(gtk.AlignEnd)
	minimizeButton.ConnectClicked(func() {
		box.SetVisible(false)
	})
	box.Append(minimizeButton)

	return &LiveCaptionWidget{
		box:          box,
		captionLabel: titleLabel,
		statusLabel:  statusLabel,
		wordFlowBox:  wordFlowBox,
		words:        make([]ai.Word, 0),
		currentWord:  0,
		minimized:    false,
	}
}

func (lc *LiveCaptionWidget) Widget() *gtk.Widget {
	lc.mu.RLock()
	defer lc.mu.RUnlock()
	return &lc.box.Widget
}

func (lc *LiveCaptionWidget) Show() {
	lc.mu.Lock()
	defer lc.mu.Unlock()
	lc.minimized = false
	lc.box.SetVisible(true)
}

func (lc *LiveCaptionWidget) Hide() {
	lc.mu.Lock()
	defer lc.mu.Unlock()
	lc.minimized = true
	lc.box.SetVisible(false)
}

func (lc *LiveCaptionWidget) SetStatus(status string) {
	lc.mu.Lock()
	defer lc.mu.Unlock()
	lc.statusLabel.SetText(status)
}

func (lc *LiveCaptionWidget) AddWord(word ai.Word) {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	lc.words = append(lc.words, word)
	lc.appendWordLabel(word)
}

func (lc *LiveCaptionWidget) appendWordLabel(word ai.Word) {
	label := gtk.NewLabel(word.Text + " ")
	label.AddCSSClass("caption-word")

	if len(lc.words) <= 5 {
		label.AddCSSClass("caption-word-recent")
	}

	lc.wordFlowBox.Append(label)
}

func (lc *LiveCaptionWidget) Clear() {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	lc.wordFlowBox.RemoveAll()
	lc.words = make([]ai.Word, 0)
	lc.currentWord = 0
}

func (lc *LiveCaptionWidget) GetWords() []ai.Word {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	result := make([]ai.Word, len(lc.words))
	copy(result, lc.words)
	return result
}

func (lc *LiveCaptionWidget) OnWordSelected(callback func(word ai.Word)) {
	lc.onWordSelected = callback
}

func (lc *LiveCaptionWidget) IsMinimized() bool {
	lc.mu.RLock()
	defer lc.mu.RUnlock()
	return lc.minimized
}

func (lc *LiveCaptionWidget) SetMinimized(minimized bool) {
	lc.mu.Lock()
	defer lc.mu.Unlock()
	lc.minimized = minimized
	if minimized {
		lc.box.SetVisible(false)
	} else {
		lc.box.SetVisible(true)
	}
}
