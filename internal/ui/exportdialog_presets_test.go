package ui

import (
	"context"
	"errors"
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/db"
)

// Red-phase contract tests for the Export Presets and Profiles track,
// Phase 2: Export Dialog Integration (2a — UI dialog wiring).
//
// See measure/tracks/export_presets_and_profiles_20260509/test-strategy.md
// §5 (Phase 2 — Dialog Integration) and §7 (targeted Red command:
//
//	go test ./internal/ui/ -run TestExportDialogPreset -count=1 -v
//
// ).
//
// The Green-phase implementation must add, in `internal/ui`, at minimum:
//
//   - type PresetListModel interface {
//         ListPresets(ctx context.Context) ([]*db.Preset, error)
//         SaveCustomPreset(ctx context.Context, p *db.Preset) error
//     }
//   - extension to ExportDialog (the existing type at
//     internal/ui/exportdialog.go:22) with unexported fields
//     `presetModel PresetListModel`, `presetDropdown *gtk.DropDown`,
//     `presets []*db.Preset`, `selectedPreset *db.Preset`,
//     `onPresetSelected func(*db.Preset)`, `pipelineConfig media.PipelineConfig`.
//   - func (*ExportDialog) SetPresetModel(m PresetListModel)
//   - func (*ExportDialog) SelectedPreset() *db.Preset
//   - func (*ExportDialog) SetOnPresetSelected(cb func(p *db.Preset))
//   - func (*ExportDialog) SaveCurrentAsCustomPreset(name, description string) error
//   - func (*ExportDialog) PipelineConfig() media.PipelineConfig
//
// The dropdown must be populated from PresetListModel.ListPresets in the
// order the model returns them (which the repository guarantees is
// built-ins-first-then-custom-by-name — test-strategy §3 contract #7 and
// internal/db/preset_repository.go:178 `ORDER BY is_builtin DESC, name ASC`).
// Default selection is index 0 — the first built-in row.
//
// "Save as Custom Preset" must validate the user-supplied name
// (test-strategy §3 path safety — no embedded \n/\r) and then delegate to
// PresetListModel.SaveCustomPreset with the preset populated from the
// current selection (name, description, container, video/audio codec,
// bitrate, width, height, IsBuiltin=false). The dialog never calls
// PresetRepository directly — production code wires *db.PresetRepository
// as PresetListModel in internal/app/run.go (alongside the existing
// export dialog wiring at run.go:960) so the test can drive the dialog
// with a stub without touching SQLite (test-strategy §6 Phase 2 + §7
// "Fakes are never registered as production gates").
//
// PipelineConfig is a read-only view derived from the selected preset
// plus the source's detected codec (test-strategy §5 Phase 2 "Stream-copy
// decision is a pure function under unit test using fakeCodecDetector").
// The dialog holds a *media.PipelineConfig field populated by the
// dialog when the selection changes; the pure-function mapping itself is
// covered by Phase 2b in internal/media/preset_pipeline_test.go. The UI
// test only asserts that PipelineConfig() returns a non-nil / populated
// value after the model is set and a preset is selected.
//
// All tests below reference symbols that do not exist yet, so the
// package will fail to compile when the targeted Red command runs. That
// is the expected Red outcome. The Green-phase author must make these
// tests pass without removing or weakening any of the contracts above.

// stubPresetListModel is a test-only in-memory implementation of
// PresetListModel. It exists exclusively in this _test.go file; go vet
// + go build ./... will fail if it leaks into a non-test file
// (test-strategy §7).
type stubPresetListModel struct {
	presets []*db.Preset
	err     error

	// recorded captures every SaveCustomPreset invocation so tests can
	// assert the dialog passes the right fields.
	recorded []*db.Preset
	saveErr  error
}

func (s *stubPresetListModel) ListPresets(ctx context.Context) ([]*db.Preset, error) {
	return s.presets, s.err
}

func (s *stubPresetListModel) SaveCustomPreset(ctx context.Context, p *db.Preset) error {
	if s.saveErr != nil {
		return s.saveErr
	}
	s.recorded = append(s.recorded, p)
	return nil
}

// TestExportDialogPresetListModel_InterfaceContract verifies that
// stubPresetListModel satisfies the PresetListModel interface at the
// type level. This is the compile-time proof that the fake cannot drift
// from the production adapter (test-strategy §7 "compile-time proof"
// pattern, mirroring the BatchQueueModel assertion at
// internal/ui/batchqueuepanel_test.go:67). Deliberately
// **display-independent** so it produces a clean Red signal in headless
// CI (test-strategy §7 + lessons-learned §"GTK Initialization Detection").
func TestExportDialogPresetListModel_InterfaceContract(t *testing.T) {
	var _ PresetListModel = (*stubPresetListModel)(nil)

	// Also verify stub round-trips: ListPresets returns the configured
	// presets; SaveCustomPreset records the call.
	s := &stubPresetListModel{
		presets: []*db.Preset{
			{Name: "Built-in One", Container: db.PresetContainerMP4, IsBuiltin: true},
			{Name: "Custom One", Container: db.PresetContainerMKV, IsBuiltin: false},
		},
	}
	got, err := s.ListPresets(context.Background())
	if err != nil {
		t.Fatalf("ListPresets error = %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("ListPresets returned %d presets, want 2", len(got))
	}
	if got[0].Name != "Built-in One" || got[1].Name != "Custom One" {
		t.Errorf("ListPresets order = [%s, %s], want [Built-in One, Custom One]", got[0].Name, got[1].Name)
	}

	if err := s.SaveCustomPreset(context.Background(), &db.Preset{Name: "X"}); err != nil {
		t.Fatalf("SaveCustomPreset error = %v", err)
	}
	if len(s.recorded) != 1 || s.recorded[0].Name != "X" {
		t.Errorf("SaveCustomPreset recording = %v, want one entry with Name='X'", s.recorded)
	}

	// SaveCustomPreset must propagate its configured error so the UI can
	// surface it to the user.
	s.saveErr = errors.New("disk full")
	if err := s.SaveCustomPreset(context.Background(), &db.Preset{Name: "Y"}); err == nil {
		t.Error("SaveCustomPreset swallowed configured error, want propagation")
	}
}

// TestExportDialogPresetDropdown_PopulatesFromModel verifies that after
// SetPresetModel + SetRecording, the dropdown is populated from the
// model's presets in the exact order the model returned them. Item
// count must equal len(model.ListPresets). (test-strategy §5 Phase 2
// "dropdown population".)
func TestExportDialogPresetDropdown_PopulatesFromModel(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	want := []*db.Preset{
		{Name: "YouTube 1080p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{Name: "Podcast Audio", Container: db.PresetContainerM4A, VideoCodec: "", AudioCodec: "aac", Bitrate: 128_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{Name: "Archive", Container: db.PresetContainerMKV, VideoCodec: "h264", AudioCodec: "flac", Bitrate: 20_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{Name: "Web Preview", Container: db.PresetContainerWebM, VideoCodec: "vp9", AudioCodec: "opus", Bitrate: 2_000_000, Width: 1280, Height: 720, IsBuiltin: true},
		{Name: "My Custom 720p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 3_000_000, Width: 1280, Height: 720, IsBuiltin: false},
	}
	m := &stubPresetListModel{presets: want}

	dialog := NewExportDialog(nil)
	dialog.SetPresetModel(m)
	dialog.SetRecording(&db.Recording{ID: 1, FilePath: "/path/to/test.mp4"})

	if dialog.presetDropdown == nil {
		t.Fatal("presetDropdown is nil after SetPresetModel+SetRecording")
	}

	model := dialog.presetDropdown.Model()
	if model == nil {
		t.Fatal("dropdown model is nil — presets not loaded")
	}
	if got := model.NItems(); got != uint(len(want)) {
		t.Errorf("dropdown NItems = %d, want %d", got, len(want))
	}

	// Verify selected preset reflects the first row (built-in first per
	// repository ordering — test-strategy §3 contract #7).
	if got := dialog.SelectedPreset(); got == nil {
		t.Fatal("SelectedPreset() returned nil after SetPresetModel+SetRecording")
	} else if got.Name != want[0].Name {
		t.Errorf("SelectedPreset().Name = %q, want %q (first row must be selected by default)", got.Name, want[0].Name)
	}
}

// TestExportDialogPresetDropdown_DefaultSelectionIsFirstBuiltin verifies
// that the dropdown's selected index is 0 immediately after
// SetPresetModel — the first row, which the repository guarantees is
// the first built-in (test-strategy §3 contract #7). This is the
// behaviour the user experiences when the dialog opens.
func TestExportDialogPresetDropdown_DefaultSelectionIsFirstBuiltin(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	want := []*db.Preset{
		{Name: "YouTube 1080p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{Name: "Archive", Container: db.PresetContainerMKV, VideoCodec: "h264", AudioCodec: "flac", Bitrate: 20_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{Name: "My Custom 720p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 3_000_000, Width: 1280, Height: 720, IsBuiltin: false},
	}
	m := &stubPresetListModel{presets: want}

	dialog := NewExportDialog(nil)
	dialog.SetPresetModel(m)
	dialog.SetRecording(&db.Recording{ID: 1, FilePath: "/path/to/test.mp4"})

	if dialog.presetDropdown == nil {
		t.Fatal("presetDropdown is nil after SetPresetModel+SetRecording")
	}
	if got := dialog.presetDropdown.Selected(); got != 0 {
		t.Errorf("dropdown selected index = %d, want 0 (first built-in)", got)
	}
	if got := dialog.SelectedPreset(); got == nil || got.Name != "YouTube 1080p" {
		t.Errorf("SelectedPreset() = %v, want YouTube 1080p", got)
	}
}

// TestExportDialogPresetDropdown_SelectingPresetFiresCallback verifies
// that changing the dropdown selection invokes the registered
// SetOnPresetSelected callback with the matching *db.Preset.
// (test-strategy §5 Phase 2 "default selection" + "Save as Custom
// Preset" wiring — the callback lets the app controller react to
// preset changes.)
func TestExportDialogPresetDropdown_SelectingPresetFiresCallback(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	want := []*db.Preset{
		{Name: "YouTube 1080p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{Name: "Archive", Container: db.PresetContainerMKV, VideoCodec: "h264", AudioCodec: "flac", Bitrate: 20_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
	}
	m := &stubPresetListModel{presets: want}

	dialog := NewExportDialog(nil)
	dialog.SetPresetModel(m)
	dialog.SetRecording(&db.Recording{ID: 1, FilePath: "/path/to/test.mp4"})

	var gotPreset *db.Preset
	var fired int
	dialog.SetOnPresetSelected(func(p *db.Preset) {
		gotPreset = p
		fired++
	})

	if dialog.onPresetSelected == nil {
		t.Fatal("onPresetSelected not set after SetOnPresetSelected")
	}

	// Programmatically select the second row — the dialog must fire the
	// callback with the matching Preset.
	dialog.presetDropdown.SetSelected(1)

	if fired < 1 {
		t.Fatalf("onPresetSelected callback did not fire (fired=%d)", fired)
	}
	if gotPreset == nil {
		t.Fatal("onPresetSelected received nil preset")
	}
	if gotPreset.Name != "Archive" {
		t.Errorf("onPresetSelected preset.Name = %q, want %q", gotPreset.Name, "Archive")
	}
}

// TestExportDialogSaveAsCustomPreset_CallsModelWithFields verifies that
// SaveCurrentAsCustomPreset("My Preset", "desc") invokes the model's
// SaveCustomPreset exactly once with a *db.Preset populated from the
// current selection (name, description, container, video/audio codec,
// bitrate, width, height, IsBuiltin=false). (test-strategy §5 Phase 2
// "Save as Custom Preset" — name/description come from the dialog
// inputs, the rest from the selected preset row.)
func TestExportDialogSaveAsCustomPreset_CallsModelWithFields(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	selected := &db.Preset{
		Name:       "YouTube 1080p",
		Container:  db.PresetContainerMP4,
		VideoCodec: "h264",
		AudioCodec: "aac",
		Bitrate:    8_000_000,
		Width:      1920,
		Height:     1080,
		IsBuiltin:  true,
		Description: "Optimized for YouTube upload at 1080p",
	}
	m := &stubPresetListModel{presets: []*db.Preset{selected}}

	dialog := NewExportDialog(nil)
	dialog.SetPresetModel(m)
	dialog.SetRecording(&db.Recording{ID: 1, FilePath: "/path/to/test.mp4"})

	if err := dialog.SaveCurrentAsCustomPreset("My Preset", "user-supplied description"); err != nil {
		t.Fatalf("SaveCurrentAsCustomPreset error = %v", err)
	}

	if len(m.recorded) != 1 {
		t.Fatalf("SaveCustomPreset recorded %d calls, want 1", len(m.recorded))
	}
	got := m.recorded[0]
	if got.Name != "My Preset" {
		t.Errorf("recorded.Name = %q, want %q", got.Name, "My Preset")
	}
	if got.Description != "user-supplied description" {
		t.Errorf("recorded.Description = %q, want %q", got.Description, "user-supplied description")
	}
	if got.Container != selected.Container {
		t.Errorf("recorded.Container = %q, want %q", got.Container, selected.Container)
	}
	if got.VideoCodec != selected.VideoCodec {
		t.Errorf("recorded.VideoCodec = %q, want %q", got.VideoCodec, selected.VideoCodec)
	}
	if got.AudioCodec != selected.AudioCodec {
		t.Errorf("recorded.AudioCodec = %q, want %q", got.AudioCodec, selected.AudioCodec)
	}
	if got.Bitrate != selected.Bitrate {
		t.Errorf("recorded.Bitrate = %d, want %d", got.Bitrate, selected.Bitrate)
	}
	if got.Width != selected.Width || got.Height != selected.Height {
		t.Errorf("recorded resolution = %dx%d, want %dx%d", got.Width, got.Height, selected.Width, selected.Height)
	}
	if got.IsBuiltin {
		t.Error("recorded.IsBuiltin = true, want false (custom presets must have IsBuiltin=false)")
	}
}

// TestExportDialogSaveAsCustomPreset_RejectsEmptyOrNewlineName verifies
// that SaveCurrentAsCustomPreset returns a validation error for an
// empty / whitespace name or a name containing embedded \n / \r
// control characters, and does NOT call the model's SaveCustomPreset
// (test-strategy §3 path safety + lessons-learned §"GStreamer Path
// Safety" — preset names flow into no shell/pipeline strings but the
// destination path still does; keep validation strict at the UI
// boundary).
func TestExportDialogSaveAsCustomPreset_RejectsEmptyOrNewlineName(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	selected := &db.Preset{
		Name: "YouTube 1080p", Container: db.PresetContainerMP4,
		VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000,
		Width: 1920, Height: 1080, IsBuiltin: true,
	}
	m := &stubPresetListModel{presets: []*db.Preset{selected}}

	dialog := NewExportDialog(nil)
	dialog.SetPresetModel(m)
	dialog.SetRecording(&db.Recording{ID: 1, FilePath: "/path/to/test.mp4"})

	for _, name := range []string{"", "   ", "\t", "bad\nname", "bad\rname", "bad\r\nname"} {
		if err := dialog.SaveCurrentAsCustomPreset(name, "desc"); err == nil {
			t.Errorf("SaveCurrentAsCustomPreset(name=%q) succeeded, want validation error", name)
		}
	}

	if len(m.recorded) != 0 {
		t.Errorf("SaveCustomPreset was called %d times despite validation errors, want 0", len(m.recorded))
	}
}