package ui

import (
	"fmt"
	"strconv"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/db"
	"verbal/internal/lifecycle"
)

// RepairOptions contains the selected repair operations.
type RepairOptions struct {
	RemoveOrphans        bool
	MarkUnavailable      bool
	RegenerateThumbnails bool
}

// RepairDialog provides a dialog for database repair operations.
type RepairDialog struct {
	dialog *gtk.Dialog

	// Reports
	inspectionReport *lifecycle.InspectionReport
	repairReport     *lifecycle.RepairReport

	// UI Components - Scan Section
	scanButton      *gtk.Button
	scanResultLabel *gtk.Label

	// UI Components - Issues Section
	issuesBox           *gtk.Box
	orphanCheck         *gtk.CheckButton
	thumbnailCheck      *gtk.CheckButton
	unavailableCheck    *gtk.CheckButton
	orphanCountLabel    *gtk.Label
	thumbnailCountLabel *gtk.Label
	unavailableLabel    *gtk.Label

	// UI Components - Progress Section
	progressBar  *gtk.ProgressBar
	statusLabel  *gtk.Label
	repairButton *gtk.Button
	closeButton  *gtk.Button

	// State
	progressPercent int
	progressMessage string

	// Callbacks
	onScan   func()
	onRepair func(options RepairOptions)
	onClose  func()
}

// NewRepairDialog creates a new repair dialog.
func NewRepairDialog(parent *gtk.Window) *RepairDialog {
	dialog := gtk.NewDialog()
	dialog.SetTitle("Database Repair")
	dialog.SetTransientFor(parent)
	dialog.SetModal(true)
	dialog.SetDefaultSize(500, 450)
	dialog.SetResizable(false)

	// Get content area
	content := dialog.ContentArea()
	content.SetSpacing(0)

	// Main container
	mainBox := gtk.NewBox(gtk.OrientationVertical, 0)
	mainBox.SetVExpand(true)
	content.Append(mainBox)

	// Header section
	headerBox := gtk.NewBox(gtk.OrientationVertical, 12)
	headerBox.SetMarginStart(18)
	headerBox.SetMarginEnd(18)
	headerBox.SetMarginTop(18)
	headerBox.SetMarginBottom(12)

	// Title
	titleLabel := gtk.NewLabel("Database Repair Tool")
	titleLabel.AddCSSClass("library-title")
	titleLabel.SetHAlign(gtk.AlignStart)
	headerBox.Append(titleLabel)

	// Description
	descLabel := gtk.NewLabel("Scan your database for issues and repair them automatically.")
	descLabel.SetHAlign(gtk.AlignStart)
	descLabel.AddCSSClass("dim-label")
	descLabel.SetWrap(true)
	headerBox.Append(descLabel)

	mainBox.Append(headerBox)

	// Scan section
	scanBox := gtk.NewBox(gtk.OrientationHorizontal, 12)
	scanBox.SetMarginStart(18)
	scanBox.SetMarginEnd(18)
	scanBox.SetMarginTop(12)
	scanBox.SetMarginBottom(12)
	scanBox.SetHAlign(gtk.AlignFill)

	scanButton := gtk.NewButtonWithLabel("Scan Database")
	scanButton.AddCSSClass("suggested-action")
	scanBox.Append(scanButton)

	scanResultLabel := gtk.NewLabel("Click Scan to check for issues")
	scanResultLabel.SetHAlign(gtk.AlignStart)
	scanResultLabel.AddCSSClass("dim-label")
	scanBox.Append(scanResultLabel)

	mainBox.Append(scanBox)

	// Separator
	separator1 := gtk.NewSeparator(gtk.OrientationHorizontal)
	mainBox.Append(separator1)

	// Issues section (initially hidden)
	issuesBox := gtk.NewBox(gtk.OrientationVertical, 8)
	issuesBox.SetMarginStart(18)
	issuesBox.SetMarginEnd(18)
	issuesBox.SetMarginTop(12)
	issuesBox.SetMarginBottom(12)
	issuesBox.SetVisible(false)

	issuesLabel := gtk.NewLabel("Issues Found")
	issuesLabel.SetHAlign(gtk.AlignStart)
	issuesLabel.AddCSSClass("heading")
	issuesBox.Append(issuesLabel)

	// Orphaned recordings check
	orphanRow := gtk.NewBox(gtk.OrientationHorizontal, 8)
	orphanCheck := gtk.NewCheckButton()
	orphanCheck.SetActive(true)
	orphanRow.Append(orphanCheck)

	orphanLabel := gtk.NewLabel("Remove orphaned database entries")
	orphanRow.Append(orphanLabel)

	orphanCountLabel := gtk.NewLabel("(0 found)")
	orphanCountLabel.AddCSSClass("dim-label")
	orphanRow.Append(orphanCountLabel)

	issuesBox.Append(orphanRow)

	// Missing thumbnails check
	thumbnailRow := gtk.NewBox(gtk.OrientationHorizontal, 8)
	thumbnailCheck := gtk.NewCheckButton()
	thumbnailCheck.SetActive(true)
	thumbnailRow.Append(thumbnailCheck)

	thumbnailLabel := gtk.NewLabel("Regenerate missing thumbnails")
	thumbnailRow.Append(thumbnailLabel)

	thumbnailCountLabel := gtk.NewLabel("(0 found)")
	thumbnailCountLabel.AddCSSClass("dim-label")
	thumbnailRow.Append(thumbnailCountLabel)

	issuesBox.Append(thumbnailRow)

	// Mark unavailable check
	unavailableRow := gtk.NewBox(gtk.OrientationHorizontal, 8)
	unavailableCheck := gtk.NewCheckButton()
	unavailableCheck.SetActive(false)
	unavailableRow.Append(unavailableCheck)

	unavailableTextLabel := gtk.NewLabel("Mark recordings with missing files as unavailable")
	unavailableRow.Append(unavailableTextLabel)

	unavailableLabel := gtk.NewLabel("")
	unavailableLabel.AddCSSClass("dim-label")
	unavailableRow.Append(unavailableLabel)

	issuesBox.Append(unavailableRow)

	mainBox.Append(issuesBox)

	// Separator
	separator2 := gtk.NewSeparator(gtk.OrientationHorizontal)
	mainBox.Append(separator2)

	// Progress section
	progressBox := gtk.NewBox(gtk.OrientationVertical, 8)
	progressBox.SetMarginStart(18)
	progressBox.SetMarginEnd(18)
	progressBox.SetMarginTop(12)
	progressBox.SetMarginBottom(12)

	progressLabel := gtk.NewLabel("Progress")
	progressLabel.SetHAlign(gtk.AlignStart)
	progressLabel.AddCSSClass("heading")
	progressBox.Append(progressLabel)

	progressBar := gtk.NewProgressBar()
	progressBar.SetShowText(true)
	progressBar.SetText("Ready")
	progressBar.SetFraction(0.0)
	progressBox.Append(progressBar)

	statusLabel := gtk.NewLabel("")
	statusLabel.SetHAlign(gtk.AlignStart)
	statusLabel.AddCSSClass("status-label")
	statusLabel.SetVisible(false)
	progressBox.Append(statusLabel)

	mainBox.Append(progressBox)

	// Button box
	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 12)
	buttonBox.SetMarginStart(18)
	buttonBox.SetMarginEnd(18)
	buttonBox.SetMarginTop(12)
	buttonBox.SetMarginBottom(18)
	buttonBox.SetHAlign(gtk.AlignEnd)

	repairButton := gtk.NewButtonWithLabel("Repair Selected")
	repairButton.AddCSSClass("suggested-action")
	repairButton.SetSensitive(false)

	closeButton := gtk.NewButtonWithLabel("Close")

	buttonBox.Append(closeButton)
	buttonBox.Append(repairButton)
	mainBox.Append(buttonBox)

	rd := &RepairDialog{
		dialog:              dialog,
		scanButton:          scanButton,
		scanResultLabel:     scanResultLabel,
		issuesBox:           issuesBox,
		orphanCheck:         orphanCheck,
		thumbnailCheck:      thumbnailCheck,
		unavailableCheck:    unavailableCheck,
		orphanCountLabel:    orphanCountLabel,
		thumbnailCountLabel: thumbnailCountLabel,
		unavailableLabel:    unavailableLabel,
		progressBar:         progressBar,
		statusLabel:         statusLabel,
		repairButton:        repairButton,
		closeButton:         closeButton,
		progressPercent:     0,
		progressMessage:     "Ready",
	}

	// Wire up signals
	scanButton.ConnectClicked(func() {
		rd.onScanClicked()
	})

	repairButton.ConnectClicked(func() {
		rd.onRepairClicked()
	})

	closeButton.ConnectClicked(func() {
		rd.onCloseClicked()
	})

	return rd
}

// SetInspectionReport updates the dialog with inspection results.
func (rd *RepairDialog) SetInspectionReport(report *lifecycle.InspectionReport) {
	rd.inspectionReport = report

	if report == nil {
		rd.issuesBox.SetVisible(false)
		rd.repairButton.SetSensitive(false)
		rd.scanResultLabel.SetText("Click Scan to check for issues")
		rd.scanResultLabel.RemoveCSSClass("error-label")
		rd.scanResultLabel.RemoveCSSClass("success-label")
		return
	}

	// Update orphan count
	orphanCount := len(report.OrphanedRecordings)
	rd.orphanCountLabel.SetText(fmt.Sprintf("(%d found)", orphanCount))
	rd.orphanCheck.SetSensitive(orphanCount > 0)
	rd.orphanCheck.SetActive(orphanCount > 0)

	// Update thumbnail count
	thumbnailCount := len(report.MissingThumbnails)
	rd.thumbnailCountLabel.SetText(fmt.Sprintf("(%d found)", thumbnailCount))
	rd.thumbnailCheck.SetSensitive(thumbnailCount > 0)
	rd.thumbnailCheck.SetActive(thumbnailCount > 0)

	// Update unavailable count (use orphaned count as proxy)
	unavailableCount := len(report.OrphanedRecordings)
	if unavailableCount > 0 {
		rd.unavailableLabel.SetText(fmt.Sprintf("(%d affected)", unavailableCount))
	} else {
		rd.unavailableLabel.SetText("")
	}

	// Show results
	if report.TotalIssues == 0 {
		rd.scanResultLabel.SetText("No issues found. Database is healthy!")
		rd.scanResultLabel.AddCSSClass("success-label")
		rd.scanResultLabel.RemoveCSSClass("error-label")
		rd.issuesBox.SetVisible(false)
		rd.repairButton.SetSensitive(false)
	} else {
		rd.scanResultLabel.SetText(fmt.Sprintf("Found %d issue(s)", report.TotalIssues))
		rd.scanResultLabel.AddCSSClass("error-label")
		rd.scanResultLabel.RemoveCSSClass("success-label")
		rd.issuesBox.SetVisible(true)
		rd.repairButton.SetSensitive(true)
	}
}

// SetRepairReport displays the repair results.
func (rd *RepairDialog) SetRepairReport(report *lifecycle.RepairReport) {
	rd.repairReport = report

	if report == nil {
		return
	}

	// Update progress to complete
	rd.UpdateProgress(100, fmt.Sprintf("Repair complete: %d operations", report.TotalRepairs))

	// Update scan result label
	if len(report.Errors) > 0 {
		rd.scanResultLabel.SetText(fmt.Sprintf("Repair completed with %d error(s)", len(report.Errors)))
		rd.scanResultLabel.AddCSSClass("error-label")
	} else {
		rd.scanResultLabel.SetText(fmt.Sprintf("Successfully repaired %d issue(s)", report.TotalRepairs))
		rd.scanResultLabel.AddCSSClass("success-label")
	}

	// Re-enable controls
	rd.SetRepairingState(false)
}

// SetOnScan sets the callback for when scan is requested.
func (rd *RepairDialog) SetOnScan(callback func()) {
	rd.onScan = callback
}

// SetOnRepair sets the callback for when repair is confirmed.
func (rd *RepairDialog) SetOnRepair(callback func(options RepairOptions)) {
	rd.onRepair = callback
}

// SetOnClose sets the callback for when dialog is closed.
func (rd *RepairDialog) SetOnClose(callback func()) {
	rd.onClose = callback
}

// Show displays the repair dialog.
func (rd *RepairDialog) Show() {
	rd.dialog.Show()
}

// Hide hides the repair dialog.
func (rd *RepairDialog) Hide() {
	rd.dialog.Hide()
}

// Close closes and destroys the repair dialog.
func (rd *RepairDialog) Close() {
	rd.dialog.Close()
}

// UpdateProgress updates the progress bar and status.
func (rd *RepairDialog) UpdateProgress(percent int, message string) {
	rd.progressPercent = percent
	rd.progressMessage = message

	fraction := float64(percent) / 100.0
	if fraction < 0 {
		fraction = 0
	}
	if fraction > 1 {
		fraction = 1
	}

	rd.progressBar.SetFraction(fraction)
	rd.progressBar.SetText(message)

	if message != "" {
		rd.statusLabel.SetText(message)
		rd.statusLabel.SetVisible(true)
	}
}

// SetRepairingState sets the dialog to repairing state (disables controls).
func (rd *RepairDialog) SetRepairingState(repairing bool) {
	rd.scanButton.SetSensitive(!repairing)
	rd.orphanCheck.SetSensitive(!repairing && len(rd.inspectionReport.OrphanedRecordings) > 0)
	rd.thumbnailCheck.SetSensitive(!repairing && len(rd.inspectionReport.MissingThumbnails) > 0)
	rd.unavailableCheck.SetSensitive(!repairing)
	rd.repairButton.SetSensitive(!repairing)
}

// onScanClicked handles the scan button click.
func (rd *RepairDialog) onScanClicked() {
	rd.UpdateProgress(0, "Scanning database...")
	rd.scanButton.SetSensitive(false)

	if rd.onScan != nil {
		rd.onScan()
	}
}

// onRepairClicked handles the repair button click.
func (rd *RepairDialog) onRepairClicked() {
	options := RepairOptions{
		RemoveOrphans:        rd.orphanCheck.Active(),
		RegenerateThumbnails: rd.thumbnailCheck.Active(),
		MarkUnavailable:      rd.unavailableCheck.Active(),
	}

	if rd.onRepair != nil {
		rd.SetRepairingState(true)
		rd.UpdateProgress(0, "Starting repairs...")
		rd.onRepair(options)
	}
}

// onCloseClicked handles the close button click.
func (rd *RepairDialog) onCloseClicked() {
	if rd.onClose != nil {
		rd.onClose()
	}
	rd.dialog.Close()
}

// Helper function to get recording ID from db.Recording
func getRecordingID(rec *db.Recording) string {
	if rec == nil {
		return ""
	}
	return strconv.FormatInt(rec.ID, 10)
}
