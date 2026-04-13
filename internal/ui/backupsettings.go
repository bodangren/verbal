package ui

import (
	"fmt"
	"time"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/lifecycle"
)

// BackupSettingsDialog provides a dialog for configuring backup settings.
type BackupSettingsDialog struct {
	dialog *gtk.Dialog

	// Controls
	enableSwitch    *gtk.Switch
	frequencyCombo  *gtk.ComboBoxText
	retentionSpin   *gtk.SpinButton
	backupDirEntry  *gtk.Entry
	chooseDirButton *gtk.Button
	manualBackupBtn *gtk.Button

	// Status labels
	statusLabel     *gtk.Label
	lastBackupLabel *gtk.Label
	nextBackupLabel *gtk.Label

	// Internal state
	autoBackupEnabled bool
	frequency         lifecycle.BackupFrequency
	retentionCount    int
	backupDir         string
	lastBackup        time.Time
	nextBackup        time.Time

	// Callbacks
	onSave         func(enabled bool, freq lifecycle.BackupFrequency, retention int, backupDir string)
	onManualBackup func() (string, error)
}

// NewBackupSettingsDialog creates a new backup settings dialog.
func NewBackupSettingsDialog(parent *gtk.Window) *BackupSettingsDialog {
	dialog := gtk.NewDialog()
	dialog.SetTitle("Backup Settings")
	dialog.SetTransientFor(parent)
	dialog.SetModal(true)
	dialog.SetDefaultSize(450, 400)
	dialog.SetResizable(false)

	content := dialog.ContentArea()
	content.SetSpacing(0)

	// Main container
	mainBox := gtk.NewBox(gtk.OrientationVertical, 0)
	content.Append(mainBox)

	// Header
	headerBox := gtk.NewBox(gtk.OrientationVertical, 12)
	headerBox.SetMarginStart(18)
	headerBox.SetMarginEnd(18)
	headerBox.SetMarginTop(18)
	headerBox.SetMarginBottom(12)

	titleLabel := gtk.NewLabel("Database Backup Settings")
	titleLabel.AddCSSClass("library-title")
	titleLabel.SetHAlign(gtk.AlignStart)

	descLabel := gtk.NewLabel("Configure automatic backups of your recording database")
	descLabel.AddCSSClass("dim-label")
	descLabel.SetHAlign(gtk.AlignStart)
	descLabel.SetWrap(true)

	headerBox.Append(titleLabel)
	headerBox.Append(descLabel)
	mainBox.Append(headerBox)

	// Separator
	separator := gtk.NewSeparator(gtk.OrientationHorizontal)
	mainBox.Append(separator)

	// Settings box
	settingsBox := gtk.NewBox(gtk.OrientationVertical, 18)
	settingsBox.SetMarginStart(18)
	settingsBox.SetMarginEnd(18)
	settingsBox.SetMarginTop(18)
	settingsBox.SetMarginBottom(18)

	// Auto-backup toggle
	enableRow := gtk.NewBox(gtk.OrientationHorizontal, 12)
	enableRow.SetHAlign(gtk.AlignFill)

	enableLabel := gtk.NewLabel("Enable Automatic Backups")
	enableLabel.SetHAlign(gtk.AlignStart)
	enableLabel.SetHExpand(true)

	enableSwitch := gtk.NewSwitch()
	enableSwitch.SetHAlign(gtk.AlignEnd)
	enableSwitch.SetTooltipText("Automatically create backups on a schedule")

	enableRow.Append(enableLabel)
	enableRow.Append(enableSwitch)
	settingsBox.Append(enableRow)

	// Frequency selector
	freqRow := gtk.NewBox(gtk.OrientationHorizontal, 12)
	freqRow.SetHAlign(gtk.AlignFill)

	freqLabel := gtk.NewLabel("Backup Frequency")
	freqLabel.SetHAlign(gtk.AlignStart)
	freqLabel.SetWidthChars(18)

	frequencyCombo := gtk.NewComboBoxText()
	frequencyCombo.Append(string(lifecycle.Daily), "Daily")
	frequencyCombo.Append(string(lifecycle.Weekly), "Weekly")
	frequencyCombo.SetActive(0)
	frequencyCombo.SetHExpand(true)
	frequencyCombo.SetTooltipText("How often to create automatic backups")

	freqRow.Append(freqLabel)
	freqRow.Append(frequencyCombo)
	settingsBox.Append(freqRow)

	// Retention count
	retentionRow := gtk.NewBox(gtk.OrientationHorizontal, 12)
	retentionRow.SetHAlign(gtk.AlignFill)

	retentionLabel := gtk.NewLabel("Keep Backups")
	retentionLabel.SetHAlign(gtk.AlignStart)
	retentionLabel.SetWidthChars(18)

	retentionSpin := gtk.NewSpinButtonWithRange(1, 100, 1)
	retentionSpin.SetValue(10)
	retentionSpin.SetHExpand(true)
	retentionSpin.SetTooltipText("Number of backups to keep (oldest are deleted)")

	retentionSuffix := gtk.NewLabel("backups")
	retentionSuffix.SetHAlign(gtk.AlignStart)

	retentionRow.Append(retentionLabel)
	retentionRow.Append(retentionSpin)
	retentionRow.Append(retentionSuffix)
	settingsBox.Append(retentionRow)

	// Backup directory
	dirRow := gtk.NewBox(gtk.OrientationHorizontal, 12)
	dirRow.SetHAlign(gtk.AlignFill)

	dirLabel := gtk.NewLabel("Backup Location")
	dirLabel.SetHAlign(gtk.AlignStart)
	dirLabel.SetWidthChars(18)

	backupDirEntry := gtk.NewEntry()
	backupDirEntry.SetHExpand(true)
	backupDirEntry.SetPlaceholderText("Default: ~/.config/verbal/backups")
	backupDirEntry.SetTooltipText("Directory where backups are stored")

	chooseDirButton := gtk.NewButtonWithLabel("Browse...")
	chooseDirButton.SetTooltipText("Choose backup directory")

	dirRow.Append(dirLabel)
	dirRow.Append(backupDirEntry)
	dirRow.Append(chooseDirButton)
	settingsBox.Append(dirRow)

	// Separator
	settingsBox.Append(gtk.NewSeparator(gtk.OrientationHorizontal))

	// Status section
	statusTitle := gtk.NewLabel("Backup Status")
	statusTitle.AddCSSClass("heading")
	statusTitle.SetHAlign(gtk.AlignStart)
	settingsBox.Append(statusTitle)

	// Last backup time
	lastBackupRow := gtk.NewBox(gtk.OrientationHorizontal, 12)
	lastBackupRow.SetHAlign(gtk.AlignFill)

	lastBackupTitle := gtk.NewLabel("Last Backup:")
	lastBackupTitle.SetHAlign(gtk.AlignStart)
	lastBackupTitle.SetWidthChars(18)

	lastBackupLabel := gtk.NewLabel("Never")
	lastBackupLabel.SetHAlign(gtk.AlignStart)
	lastBackupLabel.SetHExpand(true)

	lastBackupRow.Append(lastBackupTitle)
	lastBackupRow.Append(lastBackupLabel)
	settingsBox.Append(lastBackupRow)

	// Next backup time
	nextBackupRow := gtk.NewBox(gtk.OrientationHorizontal, 12)
	nextBackupRow.SetHAlign(gtk.AlignFill)

	nextBackupTitle := gtk.NewLabel("Next Backup:")
	nextBackupTitle.SetHAlign(gtk.AlignStart)
	nextBackupTitle.SetWidthChars(18)

	nextBackupLabel := gtk.NewLabel("Not scheduled")
	nextBackupLabel.SetHAlign(gtk.AlignStart)
	nextBackupLabel.SetHExpand(true)

	nextBackupRow.Append(nextBackupTitle)
	nextBackupRow.Append(nextBackupLabel)
	settingsBox.Append(nextBackupRow)

	// Manual backup button
	manualBackupBtn := gtk.NewButtonWithLabel("Create Backup Now")
	manualBackupBtn.AddCSSClass("suggested-action")
	manualBackupBtn.SetMarginTop(12)
	manualBackupBtn.SetHAlign(gtk.AlignCenter)
	settingsBox.Append(manualBackupBtn)

	// Status message
	statusLabel := gtk.NewLabel("")
	statusLabel.AddCSSClass("status-label")
	statusLabel.SetHAlign(gtk.AlignCenter)
	statusLabel.SetVisible(false)
	settingsBox.Append(statusLabel)

	mainBox.Append(settingsBox)

	// Button box
	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 12)
	buttonBox.SetMarginStart(18)
	buttonBox.SetMarginEnd(18)
	buttonBox.SetMarginTop(12)
	buttonBox.SetMarginBottom(18)
	buttonBox.SetHAlign(gtk.AlignEnd)

	saveButton := gtk.NewButtonWithLabel("Save")
	saveButton.AddCSSClass("suggested-action")

	cancelButton := gtk.NewButtonWithLabel("Cancel")

	buttonBox.Append(cancelButton)
	buttonBox.Append(saveButton)
	mainBox.Append(buttonBox)

	// Create dialog instance
	bsd := &BackupSettingsDialog{
		dialog:            dialog,
		enableSwitch:      enableSwitch,
		frequencyCombo:    frequencyCombo,
		retentionSpin:     retentionSpin,
		backupDirEntry:    backupDirEntry,
		chooseDirButton:   chooseDirButton,
		manualBackupBtn:   manualBackupBtn,
		statusLabel:       statusLabel,
		lastBackupLabel:   lastBackupLabel,
		nextBackupLabel:   nextBackupLabel,
		autoBackupEnabled: false,
		frequency:         lifecycle.Daily,
		retentionCount:    10,
		backupDir:         "",
	}

	// Connect signals
	enableSwitch.ConnectStateSet(func(state bool) bool {
		bsd.autoBackupEnabled = state
		// Enable/disable frequency combo based on switch state
		frequencyCombo.SetSensitive(state)
		return false
	})

	frequencyCombo.ConnectChanged(func() {
		active := frequencyCombo.Active()
		if active == 0 {
			bsd.frequency = lifecycle.Daily
		} else {
			bsd.frequency = lifecycle.Weekly
		}
	})

	retentionSpin.ConnectValueChanged(func() {
		bsd.retentionCount = int(retentionSpin.Value())
	})

	backupDirEntry.ConnectChanged(func() {
		bsd.backupDir = backupDirEntry.Text()
	})

	chooseDirButton.ConnectClicked(func() {
		// Open file chooser dialog for directory selection
		chooser := gtk.NewFileChooserNative(
			"Choose Backup Directory",
			parent,
			gtk.FileChooserActionSelectFolder,
			"Select",
			"Cancel",
		)

		chooser.ConnectResponse(func(response int) {
			if response == int(gtk.ResponseAccept) {
				file := chooser.File()
				if file != nil {
					path := file.Path()
					if path != "" {
						bsd.backupDir = path
						backupDirEntry.SetText(path)
					}
				}
			}
		})

		chooser.Show()
	})

	manualBackupBtn.ConnectClicked(func() {
		if bsd.onManualBackup != nil {
			path, err := bsd.onManualBackup()
			if err != nil {
				bsd.showStatus(fmt.Sprintf("Backup failed: %v", err), false)
			} else {
				bsd.showStatus(fmt.Sprintf("Backup created: %s", path), true)
				bsd.UpdateLastBackupTime(time.Now())
			}
		}
	})

	saveButton.ConnectClicked(func() {
		if bsd.onSave != nil {
			bsd.onSave(bsd.autoBackupEnabled, bsd.frequency, bsd.retentionCount, bsd.backupDir)
		}
		dialog.Close()
	})

	cancelButton.ConnectClicked(func() {
		dialog.Close()
	})

	return bsd
}

// Show displays the dialog.
func (bsd *BackupSettingsDialog) Show() {
	bsd.dialog.Show()
}

// Hide hides the dialog.
func (bsd *BackupSettingsDialog) Hide() {
	bsd.dialog.Hide()
}

// Close destroys the dialog.
func (bsd *BackupSettingsDialog) Close() {
	bsd.dialog.Close()
}

// SetOnSave sets the callback for when settings are saved.
func (bsd *BackupSettingsDialog) SetOnSave(callback func(enabled bool, freq lifecycle.BackupFrequency, retention int, backupDir string)) {
	bsd.onSave = callback
}

// SetOnManualBackup sets the callback for manual backup button.
func (bsd *BackupSettingsDialog) SetOnManualBackup(callback func() (string, error)) {
	bsd.onManualBackup = callback
}

// IsAutoBackupEnabled returns whether automatic backup is enabled.
func (bsd *BackupSettingsDialog) IsAutoBackupEnabled() bool {
	return bsd.autoBackupEnabled
}

// SetAutoBackupEnabled sets whether automatic backup is enabled.
func (bsd *BackupSettingsDialog) SetAutoBackupEnabled(enabled bool) {
	bsd.autoBackupEnabled = enabled
	bsd.enableSwitch.SetActive(enabled)
	bsd.frequencyCombo.SetSensitive(enabled)
}

// GetFrequency returns the backup frequency.
func (bsd *BackupSettingsDialog) GetFrequency() lifecycle.BackupFrequency {
	return bsd.frequency
}

// SetFrequency sets the backup frequency.
func (bsd *BackupSettingsDialog) SetFrequency(freq lifecycle.BackupFrequency) {
	bsd.frequency = freq
	if freq == lifecycle.Daily {
		bsd.frequencyCombo.SetActive(0)
	} else {
		bsd.frequencyCombo.SetActive(1)
	}
}

// GetRetentionCount returns the number of backups to retain.
func (bsd *BackupSettingsDialog) GetRetentionCount() int {
	return bsd.retentionCount
}

// SetRetentionCount sets the number of backups to retain (clamped to minimum 1).
func (bsd *BackupSettingsDialog) SetRetentionCount(count int) {
	if count < 1 {
		count = 1
	}
	bsd.retentionCount = count
	bsd.retentionSpin.SetValue(float64(count))
}

// GetBackupDir returns the backup directory.
func (bsd *BackupSettingsDialog) GetBackupDir() string {
	return bsd.backupDir
}

// SetBackupDir sets the backup directory.
func (bsd *BackupSettingsDialog) SetBackupDir(dir string) {
	bsd.backupDir = dir
	bsd.backupDirEntry.SetText(dir)
}

// UpdateLastBackupTime updates the last backup time display.
func (bsd *BackupSettingsDialog) UpdateLastBackupTime(t time.Time) {
	bsd.lastBackup = t
	formatted := t.Format("Jan 2, 2006 3:04 PM")
	bsd.lastBackupLabel.SetText(formatted)
}

// UpdateNextBackupTime updates the next backup time display.
func (bsd *BackupSettingsDialog) UpdateNextBackupTime(t time.Time) {
	bsd.nextBackup = t
	if t.IsZero() {
		bsd.nextBackupLabel.SetText("Not scheduled")
	} else {
		formatted := t.Format("Jan 2, 2006 3:04 PM")
		bsd.nextBackupLabel.SetText(formatted)
	}
}

// showStatus shows a status message.
func (bsd *BackupSettingsDialog) showStatus(message string, success bool) {
	bsd.statusLabel.SetText(message)
	bsd.statusLabel.SetVisible(true)

	if success {
		bsd.statusLabel.RemoveCSSClass("error")
		bsd.statusLabel.AddCSSClass("success")
	} else {
		bsd.statusLabel.RemoveCSSClass("success")
		bsd.statusLabel.AddCSSClass("error")
	}
}

// simulateSave is used for testing to trigger the save callback.
func (bsd *BackupSettingsDialog) simulateSave() {
	if bsd.onSave != nil {
		bsd.onSave(bsd.autoBackupEnabled, bsd.frequency, bsd.retentionCount, bsd.backupDir)
	}
}
