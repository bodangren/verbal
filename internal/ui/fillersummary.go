package ui

import (
	"fmt"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/filler"
)

type FillerSummaryWidget struct {
	box *gtk.Box

	shortFillerCount *gtk.Label
	hesitationCount  *gtk.Label
	repetitionCount  *gtk.Label
	totalCount       *gtk.Label

	fillerList *gtk.ListBox

	navPrevButton *gtk.Button
	navNextButton *gtk.Button
	removeAllButton *gtk.Button

	fillers []*filler.FillerWord
	currentIndex int

	onNavigate func(index int)
	onRemoveAll func()
	onRemoveOne func(index int)
}

func NewFillerSummaryWidget() *FillerSummaryWidget {
	box := gtk.NewBox(gtk.OrientationVertical, 8)
	box.AddCSSClass("settings-panel")
	box.SetMarginStart(12)
	box.SetMarginEnd(12)
	box.SetMarginTop(8)
	box.SetMarginBottom(8)

	titleLabel := gtk.NewLabel("Filler Words")
	titleLabel.AddCSSClass("settings-title")
	titleLabel.SetHAlign(gtk.AlignStart)
	box.Append(titleLabel)

	countsBox := gtk.NewBox(gtk.OrientationHorizontal, 16)
	countsBox.SetHAlign(gtk.AlignStart)

	shortFillerBox := gtk.NewBox(gtk.OrientationVertical, 2)
	shortFillerCount := gtk.NewLabel("0")
	shortFillerCount.AddCSSClass("mono")
	shortFillerCount.SetHAlign(gtk.AlignStart)
	shortLabel := gtk.NewLabel("Short (um, uh)")
	shortLabel.AddCSSClass("text-secondary")
	shortLabel.SetHAlign(gtk.AlignStart)
	shortFillerBox.Append(shortFillerCount)
	shortFillerBox.Append(shortLabel)

	hesitationBox := gtk.NewBox(gtk.OrientationVertical, 2)
	hesitationCount := gtk.NewLabel("0")
	hesitationCount.AddCSSClass("mono")
	hesitationCount.SetHAlign(gtk.AlignStart)
	hesitationLabel := gtk.NewLabel("Discourse (like)")
	hesitationLabel.AddCSSClass("text-secondary")
	hesitationLabel.SetHAlign(gtk.AlignStart)
	hesitationBox.Append(hesitationCount)
	hesitationBox.Append(hesitationLabel)

	repetitionBox := gtk.NewBox(gtk.OrientationVertical, 2)
	repetitionCount := gtk.NewLabel("0")
	repetitionCount.AddCSSClass("mono")
	repetitionCount.SetHAlign(gtk.AlignStart)
	repetitionLabel := gtk.NewLabel("Repetition")
	repetitionLabel.AddCSSClass("text-secondary")
	repetitionLabel.SetHAlign(gtk.AlignStart)
	repetitionBox.Append(repetitionCount)
	repetitionBox.Append(repetitionLabel)

	totalBox := gtk.NewBox(gtk.OrientationVertical, 2)
	totalCount := gtk.NewLabel("0 total")
	totalCount.AddCSSClass("mono")
	totalCount.SetHAlign(gtk.AlignStart)
	totalBox.Append(totalCount)

	countsBox.Append(shortFillerBox)
	countsBox.Append(hesitationBox)
	countsBox.Append(repetitionBox)
	countsBox.Append(totalBox)
	box.Append(countsBox)

	separator := gtk.NewSeparator(gtk.OrientationHorizontal)
	box.Append(separator)

	fillerList := gtk.NewListBox()
	fillerList.AddCSSClass("library-list")
	box.Append(fillerList)

	navBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	navBox.SetHAlign(gtk.AlignCenter)

	navPrevButton := gtk.NewButtonFromIconName("go-previous-symbolic")
	navPrevButton.SetTooltipText("Previous filler")
	navPrevButton.AddCSSClass("flat")

	navNextButton := gtk.NewButtonFromIconName("go-next-symbolic")
	navNextButton.SetTooltipText("Next filler")
	navNextButton.AddCSSClass("flat")

	navBox.Append(navPrevButton)
	navBox.Append(navNextButton)
	box.Append(navBox)

	removeAllButton := gtk.NewButtonWithLabel("Remove All Fillers")
	removeAllButton.AddCSSClass("destructive-action")
	removeAllButton.SetSensitive(false)
	box.Append(removeAllButton)

	widget := &FillerSummaryWidget{
		box:               box,
		shortFillerCount:  shortFillerCount,
		hesitationCount:   hesitationCount,
		repetitionCount:   repetitionCount,
		totalCount:        totalCount,
		fillerList:        fillerList,
		navPrevButton:     navPrevButton,
		navNextButton:     navNextButton,
		removeAllButton:   removeAllButton,
		fillers:           nil,
		currentIndex:      -1,
	}

	navPrevButton.ConnectClicked(func() {
		if widget.currentIndex > 0 {
			widget.currentIndex--
			widget.highlightCurrent()
			if widget.onNavigate != nil {
				widget.onNavigate(widget.currentIndex)
			}
		}
	})

	navNextButton.ConnectClicked(func() {
		if widget.currentIndex < len(widget.fillers)-1 {
			widget.currentIndex++
			widget.highlightCurrent()
			if widget.onNavigate != nil {
				widget.onNavigate(widget.currentIndex)
			}
		}
	})

	return widget
}

func (w *FillerSummaryWidget) Widget() *gtk.Box {
	return w.box
}

func (w *FillerSummaryWidget) UpdateWithFillers(fillers []*filler.FillerWord) {
	w.fillers = fillers
	w.currentIndex = -1

	shortCount := 0
	hesitationCount := 0
	repetitionCount := 0

	for _, f := range fillers {
		switch f.Type {
		case filler.TypeShortFiller:
			shortCount++
		case filler.TypeHesitation:
			hesitationCount++
		case filler.TypeRepetition:
			repetitionCount++
		}
	}

	w.shortFillerCount.SetText(fmt.Sprintf("%d", shortCount))
	w.hesitationCount.SetText(fmt.Sprintf("%d", hesitationCount))
	w.repetitionCount.SetText(fmt.Sprintf("%d", repetitionCount))
	w.totalCount.SetText(fmt.Sprintf("%d total", len(fillers)))

	w.removeAllButton.SetSensitive(len(fillers) > 0)

	for _, child := range w.fillerList.Children() {
		w.fillerList.Remove(child)
	}

	for i, f := range fillers {
		row := gtk.NewListBoxRow()
		rowBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
		rowBox.SetMarginStart(8)
		rowBox.SetMarginEnd(8)
		rowBox.SetMarginTop(4)
		rowBox.SetMarginBottom(4)

		typeLabel := gtk.NewLabel(f.Type.String())
		typeLabel.AddCSSClass("mono")
		typeLabel.SetWidthChars(12)
		typeLabel.SetHAlign(gtk.AlignStart)

		textLabel := gtk.NewLabel(fmt.Sprintf(`"%s"`, f.Text))
		textLabel.SetHAlign(gtk.AlignStart)
		textLabel.SetHexpand(true)

		timeLabel := gtk.NewLabel(fmt.Sprintf("%.1fs-%.1fs", f.Start, f.End))
		timeLabel.AddCSSClass("text-secondary")
		timeLabel.SetHAlign(gtk.AlignEnd)

		rowBox.Append(typeLabel)
		rowBox.Append(textLabel)
		rowBox.Append(timeLabel)
		row.SetChild(rowBox)

		w.fillerList.Append(row)
	}
}

func (w *FillerSummaryWidget) highlightCurrent() {
	w.navPrevButton.SetSensitive(w.currentIndex > 0)
	w.navNextButton.SetSensitive(w.currentIndex < len(w.fillers)-1)
}

func (w *FillerSummaryWidget) SetNavigateCallback(cb func(index int)) {
	w.onNavigate = cb
}

func (w *FillerSummaryWidget) SetRemoveAllCallback(cb func()) {
	w.onRemoveAll = cb
	w.removeAllButton.ConnectClicked(func() {
		if w.onRemoveAll != nil {
			w.onRemoveAll()
		}
	})
}

func (w *FillerSummaryWidget) SetRemoveOneCallback(cb func(index int)) {
	w.onRemoveOne = cb
}

func (w *FillerSummaryWidget) GetCurrentIndex() int {
	return w.currentIndex
}

func (w *FillerSummaryWidget) GetFillers() []*filler.FillerWord {
	return w.fillers
}

func (w *FillerSummaryWidget) Clear() {
	w.fillers = nil
	w.currentIndex = -1
	w.shortFillerCount.SetText("0")
	w.hesitationCount.SetText("0")
	w.repetitionCount.SetText("0")
	w.totalCount.SetText("0 total")
	w.removeAllButton.SetSensitive(false)

	for _, child := range w.fillerList.Children() {
		w.fillerList.Remove(child)
	}
}