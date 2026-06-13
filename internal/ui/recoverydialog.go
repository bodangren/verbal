package ui

import (
	"time"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

type RecoveryDialog struct {
	dialog *gtk.Dialog

	projectInfo *ProjectRecoveryInfo

	recoverButton *gtk.Button
	discardButton *gtk.Button
	closeButton  *gtk.Button

	onRecover func()
	onDiscard func()
	onClose   func()
}

type ProjectRecoveryInfo struct {
	ProjectID       int64
	ProjectName     string
	SavedAt         time.Time
	WordCount       int
	PlaybackPosition int64
}

func NewRecoveryDialog(parent *gtk.Window) *RecoveryDialog {
	dialog := gtk.NewDialog()
	dialog.SetTitle("Crash Recovery")
	dialog.SetTransientFor(parent)
	dialog.SetModal(true)
	dialog.SetDefaultSize(450, 300)
	dialog.SetResizable(false)

	content := dialog.ContentArea()
	content.SetSpacing(0)

	mainBox := gtk.NewBox(gtk.OrientationVertical, 0)
	mainBox.SetVExpand(true)
	content.Append(mainBox)

	headerBox := gtk.NewBox(gtk.OrientationVertical, 12)
	headerBox.SetMarginStart(18)
	headerBox.SetMarginEnd(18)
	headerBox.SetMarginTop(18)
	headerBox.SetMarginBottom(12)

	titleLabel := gtk.NewLabel("Crash Recovery Available")
	titleLabel.AddCSSClass("library-title")
	titleLabel.SetHAlign(gtk.AlignStart)
	headerBox.Append(titleLabel)

	descLabel := gtk.NewLabel("We found unsaved work from a previous session. Would you like to recover it?")
	descLabel.SetHAlign(gtk.AlignStart)
	descLabel.AddCSSClass("dim-label")
	descLabel.SetWrap(true)
	headerBox.Append(descLabel)

	mainBox.Append(headerBox)

	infoBox := gtk.NewBox(gtk.OrientationVertical, 8)
	infoBox.SetMarginStart(18)
	infoBox.SetMarginEnd(18)
	infoBox.SetMarginBottom(12)
	mainBox.Append(infoBox)

	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 12)
	buttonBox.SetMarginStart(18)
	buttonBox.SetMarginEnd(18)
	buttonBox.SetMarginBottom(18)
	buttonBox.SetHAlign(gtk.AlignEnd)
	mainBox.Append(buttonBox)

	rd := &RecoveryDialog{
		dialog: dialog,
	}

	recoverButton := gtk.NewButtonWithLabel("Recover")
	recoverButton.AddCSSClass("suggested-action")
	recoverButton.ConnectClicked(func() {
		if rd.onRecover != nil {
			rd.onRecover()
		}
		rd.dialog.Close()
	})
	buttonBox.Append(recoverButton)
	rd.recoverButton = recoverButton

	discardButton := gtk.NewButtonWithLabel("Discard")
	discardButton.ConnectClicked(func() {
		if rd.onDiscard != nil {
			rd.onDiscard()
		}
		rd.dialog.Close()
	})
	buttonBox.Append(discardButton)
	rd.discardButton = discardButton

	closeButton := gtk.NewButtonWithLabel("Cancel")
	closeButton.ConnectClicked(func() {
		if rd.onClose != nil {
			rd.onClose()
		}
		rd.dialog.Close()
	})
	buttonBox.Append(closeButton)
	rd.closeButton = closeButton

	dialog.ConnectCloseRequest(func() (ok bool) {
		if rd.onClose != nil {
			rd.onClose()
		}
		return false
	})

	return rd
}

func (rd *RecoveryDialog) SetProjectInfo(info *ProjectRecoveryInfo) {
	rd.projectInfo = info
}

func (rd *RecoveryDialog) Widget() *gtk.Dialog {
	return rd.dialog
}

func (rd *RecoveryDialog) SetOnRecover(callback func()) {
	rd.onRecover = callback
}

func (rd *RecoveryDialog) SetOnDiscard(callback func()) {
	rd.onDiscard = callback
}

func (rd *RecoveryDialog) SetOnClose(callback func()) {
	rd.onClose = callback
}

func (rd *RecoveryDialog) Show() {
	rd.dialog.Show()
}
