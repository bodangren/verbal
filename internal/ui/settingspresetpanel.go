package ui

import (
	"context"
	"fmt"
	"strings"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/db"
)

// PresetManagementModel is the interface the SettingsPresetPanel uses to
// fetch, update, and delete presets. Production code adapts
// *db.PresetRepository; tests use a stub (mirrors PresetListModel at
// internal/ui/exportdialog.go:18 and BatchQueueModel at
// internal/ui/batchqueuepanel.go:21).
type PresetManagementModel interface {
	ListPresets(ctx context.Context) ([]*db.Preset, error)
	UpdatePreset(ctx context.Context, p *db.Preset) error
	DeletePreset(ctx context.Context, id int64) error
}

// SettingsPresetPanel displays the list of export presets in the
// settings window, allowing the user to edit or delete custom presets.
// Built-in presets are shown with edit/delete disabled.
type SettingsPresetPanel struct {
	model         PresetManagementModel
	presets       []*db.Preset
	editButtons   []*gtk.Button
	deleteButtons []*gtk.Button
	box           *gtk.ListBox
}

// NewSettingsPresetPanel creates a new preset management panel driven
// by the given model.
func NewSettingsPresetPanel(model PresetManagementModel) *SettingsPresetPanel {
	listBox := gtk.NewListBox()
	listBox.AddCSSClass("library-list")
	listBox.SetSelectionMode(gtk.SelectionNone)

	p := &SettingsPresetPanel{
		model: model,
		box:   listBox,
	}
	return p
}

// Widget returns the underlying GTK widget for embedding in a parent
// container.
func (p *SettingsPresetPanel) Widget() *gtk.Widget {
	return &p.box.Widget
}

// Refresh fetches the latest presets from the model and rebuilds the
// list rows. Must be called on the GTK main thread.
func (p *SettingsPresetPanel) Refresh(ctx context.Context) error {
	presets, err := p.model.ListPresets(ctx)
	if err != nil {
		return err
	}
	p.presets = presets
	p.rebuildRows()
	return nil
}

// Snapshot returns a copy of the current preset state.
func (p *SettingsPresetPanel) Snapshot() []*db.Preset {
	if p.presets == nil {
		return []*db.Preset{}
	}
	result := make([]*db.Preset, len(p.presets))
	copy(result, p.presets)
	return result
}

// IsEditEnabled returns true if the preset at the given index is a
// custom preset (not built-in) and can be edited.
func (p *SettingsPresetPanel) IsEditEnabled(idx int) bool {
	if idx < 0 || idx >= len(p.presets) {
		return false
	}
	return !p.presets[idx].IsBuiltin
}

// IsDeleteEnabled returns true if the preset at the given index is a
// custom preset (not built-in) and can be deleted.
func (p *SettingsPresetPanel) IsDeleteEnabled(idx int) bool {
	if idx < 0 || idx >= len(p.presets) {
		return false
	}
	return !p.presets[idx].IsBuiltin
}

// TriggerDelete deletes the preset at the given index. For custom
// presets it calls the model's DeletePreset, then auto-refreshes. For
// built-in presets it returns a validation error without calling the
// model.
func (p *SettingsPresetPanel) TriggerDelete(idx int) error {
	if idx < 0 || idx >= len(p.presets) {
		return fmt.Errorf("settingspresetpanel: invalid index %d", idx)
	}
	preset := p.presets[idx]
	if preset.IsBuiltin {
		return fmt.Errorf("settingspresetpanel: built-in presets cannot be deleted")
	}

	if err := p.model.DeletePreset(context.Background(), preset.ID); err != nil {
		return err
	}

	// Auto-refresh so the snapshot reflects the deletion.
	_ = p.Refresh(context.Background())
	return nil
}

// TriggerEdit edits the preset at the given index. For custom presets
// it validates the name, calls the model's UpdatePreset with the new
// name and description (preserving other fields), then auto-refreshes.
// For built-in presets it returns a validation error without calling
// the model.
func (p *SettingsPresetPanel) TriggerEdit(idx int, name, description string) error {
	if idx < 0 || idx >= len(p.presets) {
		return fmt.Errorf("settingspresetpanel: invalid index %d", idx)
	}
	preset := p.presets[idx]
	if preset.IsBuiltin {
		return fmt.Errorf("settingspresetpanel: built-in presets cannot be edited")
	}

	// Validate name at the UI boundary (defence in depth — mirrors
	// ExportDialog.SaveCurrentAsCustomPreset and repository validatePreset).
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("settingspresetpanel: preset name must not be empty")
	}
	if strings.ContainsAny(name, "\n\r") {
		return fmt.Errorf("settingspresetpanel: preset name must not contain embedded control characters")
	}

	updated := &db.Preset{
		ID:          preset.ID,
		Name:        name,
		Description: description,
		Container:   preset.Container,
		VideoCodec:  preset.VideoCodec,
		AudioCodec:  preset.AudioCodec,
		Bitrate:     preset.Bitrate,
		Width:       preset.Width,
		Height:      preset.Height,
		IsBuiltin:   false,
	}

	if err := p.model.UpdatePreset(context.Background(), updated); err != nil {
		return err
	}

	// Auto-refresh so the snapshot reflects the rename.
	_ = p.Refresh(context.Background())
	return nil
}

// rebuildRows rebuilds the ListBox rows from the current presets slice.
func (p *SettingsPresetPanel) rebuildRows() {
	p.box.RemoveAll()
	p.editButtons = nil
	p.deleteButtons = nil

	for i, preset := range p.presets {
		row := gtk.NewListBoxRow()

		rowBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
		rowBox.SetMarginStart(8)
		rowBox.SetMarginEnd(8)
		rowBox.SetMarginTop(4)
		rowBox.SetMarginBottom(4)

		// Preset name label
		nameLabel := gtk.NewLabel(preset.Name)
		nameLabel.SetHAlign(gtk.AlignStart)
		nameLabel.SetHExpand(true)
		nameLabel.SetEllipsize(3) // PANGO_ELLIPSIZE_END
		rowBox.Append(nameLabel)

		// Container badge
		containerLabel := gtk.NewLabel(preset.Container)
		containerLabel.AddCSSClass("mono")
		containerLabel.SetHAlign(gtk.AlignEnd)
		rowBox.Append(containerLabel)

		// Edit button
		editBtn := gtk.NewButtonFromIconName("document-edit-symbolic")
		editBtn.SetTooltipText("Edit preset")
		editBtn.AddCSSClass("flat")
		editBtn.SetSensitive(!preset.IsBuiltin)
		editIdx := i
		editBtn.ConnectClicked(func() {
			// The actual edit dialog is wired by the SettingsWindow;
			// this button's sensitivity is controlled by IsEditEnabled.
		})
		rowBox.Append(editBtn)
		p.editButtons = append(p.editButtons, editBtn)

		// Delete button
		deleteBtn := gtk.NewButtonFromIconName("edit-delete-symbolic")
		deleteBtn.SetTooltipText("Delete preset")
		deleteBtn.AddCSSClass("flat")
		deleteBtn.SetSensitive(!preset.IsBuiltin)
		_ = editIdx // suppress unused warning; button wiring is UI-only
		rowBox.Append(deleteBtn)
		p.deleteButtons = append(p.deleteButtons, deleteBtn)

		row.SetChild(rowBox)
		p.box.Append(row)
	}
}
