package ui

import (
	"context"
	"errors"
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/db"
)

// Red-phase contract tests for the Export Presets and Profiles track,
// Phase 3: Settings Management.
//
// See measure/tracks/export_presets_and_profiles_20260509/test-strategy.md
// §5 (Phase 3 — Settings Panel) and §7 (targeted Red command:
//
//	go test ./internal/ui/ -run TestSettingsPresetPanel -count=1 -v
//
// ).
//
// The Green-phase implementation must add, in `internal/ui`, at minimum:
//
//   - type PresetManagementModel interface {
//         ListPresets(ctx context.Context) ([]*db.Preset, error)
//         UpdatePreset(ctx context.Context, p *db.Preset) error
//         DeletePreset(ctx context.Context, id int64) error
//     }
//   - new file `internal/ui/settingspresetpanel.go` containing:
//
//       type SettingsPresetPanel struct { ... }
//
//       with unexported fields:
//         model         PresetManagementModel
//         presets       []*db.Preset
//         editButtons   []*gtk.Button  // one per row, sensitive only for custom presets
//         deleteButtons []*gtk.Button  // one per row, sensitive only for custom presets
//         box           *gtk.ListBox
//
//   - func NewSettingsPresetPanel(model PresetManagementModel) *SettingsPresetPanel
//   - method (*SettingsPresetPanel) Widget() *gtk.Widget
//   - method (*SettingsPresetPanel) Refresh(ctx context.Context) error
//   - method (*SettingsPresetPanel) Snapshot() []*db.Preset
//   - method (*SettingsPresetPanel) IsEditEnabled(idx int) bool
//   - method (*SettingsPresetPanel) IsDeleteEnabled(idx int) bool
//   - method (*SettingsPresetPanel) TriggerDelete(idx int) error
//   - method (*SettingsPresetPanel) TriggerEdit(idx int, name, description string) error
//
//   - extension to SettingsWindow (existing type at
//     internal/ui/settingswindow.go:12) with:
//         presetModel PresetManagementModel
//         presetPanel *SettingsPresetPanel
//
//   - func (*SettingsWindow) SetPresetModel(m PresetManagementModel)
//
// The panel must populate from PresetManagementModel.ListPresets in the
// order the model returns them (which the repository guarantees is
// built-ins-first-then-custom-by-name — test-strategy §3 contract #7 and
// internal/db/preset_repository.go:178 `ORDER BY is_builtin DESC, name ASC`).
//
// **Defence-in-depth on built-in immutability (test-strategy §3):**
// the panel must reject edit / delete on built-in rows BOTH at the UI
// level (IsEditEnabled / IsDeleteEnabled return false; TriggerEdit /
// TriggerDelete return an error before calling the model) AND it must
// surface the repository's built-in-immutability error to the caller
// when the model rejects the operation (e.g., racing edits arriving via
// other paths).
//
// **Name validation at the UI boundary (test-strategy §3 path safety):**
// TriggerEdit must reject empty / whitespace names and names containing
// embedded \n / \r control characters before calling the model. This
// mirrors the validation in ExportDialog.SaveCurrentAsCustomPreset
// (internal/ui/exportdialog.go:419) and in the repository's
// validatePreset (internal/db/preset_repository.go:342) — defence in
// depth, no single point of failure.
//
// **Decoupling from internal/db (test-strategy §6 + §7):**
// The panel surface uses PresetManagementModel, not *db.PresetRepository
// directly, so tests drive it with a stub without touching SQLite. The
// Green-phase author must wire *db.PresetRepository as the production
// PresetManagementModel adapter in internal/app/run.go (alongside the
// existing export dialog wiring at run.go:960 and the Phase 2 preset
// model wiring).
//
// **Refresh semantics:**
// TriggerDelete and TriggerEdit must refresh the panel after a
// successful model call so the list reflects the new state. This is
// the "edit/delete FSM" required by test-strategy §1 Phase 3.
//
// All tests below reference symbols that do not exist yet, so the
// package will fail to compile when the targeted Red command runs. That
// is the expected Red outcome. The Green-phase author must make these
// tests pass without removing or weakening any of the contracts above.

// stubPresetManagementModel is a test-only in-memory implementation of
// PresetManagementModel. It exists exclusively in this _test.go file;
// go vet + go build ./... will fail if it leaks into a non-test file
// (test-strategy §7 "Fakes are never registered as production gates").
type stubPresetManagementModel struct {
	presets []*db.Preset

	// listErr / updateErr / deleteErr inject errors on demand so tests
	// can assert error propagation.
	listErr   error
	updateErr error
	deleteErr error

	// recorded* capture every model invocation so tests can verify the
	// panel calls the model with the right arguments.
	recordedUpdates []*db.Preset
	recordedDeletes []int64

	// listCalls counts ListPresets invocations so tests can verify the
	// panel auto-refreshes after a successful mutation.
	listCalls int
}

func (s *stubPresetManagementModel) ListPresets(ctx context.Context) ([]*db.Preset, error) {
	s.listCalls++
	if s.listErr != nil {
		return nil, s.listErr
	}
	// Return a copy so the panel's snapshot is independent of the stub's
	// internal mutations (defence in depth — mirrors the repository's
	// row-by-row scanning behaviour).
	out := make([]*db.Preset, len(s.presets))
	copy(out, s.presets)
	return out, nil
}

func (s *stubPresetManagementModel) UpdatePreset(ctx context.Context, p *db.Preset) error {
	if s.updateErr != nil {
		return s.updateErr
	}
	// Record a snapshot of the preset at update-time so later mutations
	// in test code don't change what we asserted on.
	rec := *p
	s.recordedUpdates = append(s.recordedUpdates, &rec)
	// Apply the update in-place so subsequent ListPresets reflects the
	// new state (test fixtures rely on Refresh seeing the change).
	for i, existing := range s.presets {
		if existing.ID == p.ID {
			s.presets[i] = &rec
			break
		}
	}
	return nil
}

func (s *stubPresetManagementModel) DeletePreset(ctx context.Context, id int64) error {
	if s.deleteErr != nil {
		return s.deleteErr
	}
	s.recordedDeletes = append(s.recordedDeletes, id)
	// Remove from in-memory list so subsequent ListPresets reflects the
	// deletion (test fixtures rely on Refresh seeing the change).
	filtered := s.presets[:0]
	for _, p := range s.presets {
		if p.ID != id {
			filtered = append(filtered, p)
		}
	}
	s.presets = filtered
	return nil
}

// TestSettingsPresetPanel_InterfaceContract verifies that
// stubPresetManagementModel satisfies the PresetManagementModel
// interface at the type level. This is the compile-time proof that the
// fake cannot drift from the production adapter (test-strategy §7
// "compile-time proof" pattern, mirroring
// TestExportDialogPresetListModel_InterfaceContract at
// internal/ui/exportdialog_presets_test.go:104 and the
// BatchQueueModel assertion at internal/ui/batchqueuepanel_test.go:67).
// Deliberately **display-independent** so it produces a clean Red
// signal in headless CI (test-strategy §7 + lessons-learned
// §"GTK Initialization Detection").
func TestSettingsPresetPanel_InterfaceContract(t *testing.T) {
	var _ PresetManagementModel = (*stubPresetManagementModel)(nil)

	s := &stubPresetManagementModel{
		presets: []*db.Preset{
			{ID: 1, Name: "Built-in", Container: db.PresetContainerMP4, IsBuiltin: true},
			{ID: 2, Name: "Custom", Container: db.PresetContainerMKV, IsBuiltin: false},
		},
	}

	// ListPresets round-trip.
	got, err := s.ListPresets(context.Background())
	if err != nil {
		t.Fatalf("ListPresets error = %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("ListPresets returned %d presets, want 2", len(got))
	}
	if s.listCalls != 1 {
		t.Errorf("listCalls = %d after one call, want 1", s.listCalls)
	}

	// UpdatePreset round-trip.
	if err := s.UpdatePreset(context.Background(), &db.Preset{ID: 2, Name: "Renamed"}); err != nil {
		t.Fatalf("UpdatePreset error = %v", err)
	}
	if len(s.recordedUpdates) != 1 || s.recordedUpdates[0].ID != 2 || s.recordedUpdates[0].Name != "Renamed" {
		t.Errorf("recordedUpdates = %v, want one entry with ID=2 Name=Renamed", s.recordedUpdates)
	}

	// DeletePreset round-trip.
	if err := s.DeletePreset(context.Background(), 2); err != nil {
		t.Fatalf("DeletePreset error = %v", err)
	}
	if len(s.recordedDeletes) != 1 || s.recordedDeletes[0] != 2 {
		t.Errorf("recordedDeletes = %v, want [2]", s.recordedDeletes)
	}
	// After delete, ListPresets must reflect the new state.
	got, _ = s.ListPresets(context.Background())
	if len(got) != 1 || got[0].ID != 1 {
		t.Errorf("after delete: ListPresets = %v, want only the built-in (ID=1)", got)
	}

	// Errors must propagate to the caller (panel surfaces them to the user).
	s.updateErr = errors.New("simulated repo error")
	if err := s.UpdatePreset(context.Background(), &db.Preset{ID: 1}); err == nil {
		t.Error("UpdatePreset swallowed configured error, want propagation")
	}
	s.updateErr = nil

	s.deleteErr = errors.New("built-in presets are immutable")
	if err := s.DeletePreset(context.Background(), 1); err == nil {
		t.Error("DeletePreset swallowed configured error, want propagation")
	}
	s.deleteErr = nil

	s.listErr = errors.New("db closed")
	if _, err := s.ListPresets(context.Background()); err == nil {
		t.Error("ListPresets swallowed configured error, want propagation")
	}
}

// TestSettingsPresetPanel_PopulatesFromModel verifies that NewSettingsPresetPanel
// + Refresh populates the panel's snapshot from the model's presets in
// the exact order the model returned them. Snapshot count must equal
// len(model.ListPresets). (test-strategy §5 Phase 3 "list model
// contents" + §1 Phase 3 unit test.)
func TestSettingsPresetPanel_PopulatesFromModel(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	want := []*db.Preset{
		{ID: 10, Name: "YouTube 1080p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{ID: 11, Name: "Podcast Audio", Container: db.PresetContainerM4A, VideoCodec: "", AudioCodec: "aac", Bitrate: 128_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{ID: 12, Name: "Archive", Container: db.PresetContainerMKV, VideoCodec: "h264", AudioCodec: "flac", Bitrate: 20_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{ID: 13, Name: "Web Preview", Container: db.PresetContainerWebM, VideoCodec: "vp9", AudioCodec: "opus", Bitrate: 2_000_000, Width: 1280, Height: 720, IsBuiltin: true},
		{ID: 100, Name: "My Custom 720p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 3_000_000, Width: 1280, Height: 720, IsBuiltin: false},
	}
	m := &stubPresetManagementModel{presets: want}

	panel := NewSettingsPresetPanel(m)
	if panel == nil {
		t.Fatal("NewSettingsPresetPanel returned nil")
	}
	if panel.Widget() == nil {
		t.Error("Widget() returned nil — panel must expose a GTK widget for embedding")
	}

	if err := panel.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh error = %v", err)
	}

	snapshot := panel.Snapshot()
	if len(snapshot) != len(want) {
		t.Fatalf("Snapshot length = %d, want %d", len(snapshot), len(want))
	}
	for i, p := range snapshot {
		if p.ID != want[i].ID {
			t.Errorf("snapshot[%d].ID = %d, want %d (model order must be preserved — built-ins first per repo §3 contract #7)", i, p.ID, want[i].ID)
		}
		if p.Name != want[i].Name {
			t.Errorf("snapshot[%d].Name = %q, want %q", i, p.Name, want[i].Name)
		}
	}
}

// TestSettingsPresetPanel_EditDeleteDisabledForBuiltins verifies that
// edit and delete actions are blocked at the UI level for built-in
// presets (test-strategy §3 cross-phase "Built-in immutability: Phase 3
// delete/edit must reject is_builtin=1 rows ... at UI level (greyed
// buttons)" + §5 Phase 3 "delete/edit are blocked for built-ins").
func TestSettingsPresetPanel_EditDeleteDisabledForBuiltins(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	presets := []*db.Preset{
		{ID: 1, Name: "YouTube 1080p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{ID: 2, Name: "Archive", Container: db.PresetContainerMKV, VideoCodec: "h264", AudioCodec: "flac", Bitrate: 20_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{ID: 100, Name: "Custom 720p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 3_000_000, Width: 1280, Height: 720, IsBuiltin: false},
	}
	m := &stubPresetManagementModel{presets: presets}

	panel := NewSettingsPresetPanel(m)
	if err := panel.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh error = %v", err)
	}

	// Built-ins (rows 0 and 1): edit and delete must be disabled.
	for idx := 0; idx < 2; idx++ {
		if panel.IsEditEnabled(idx) {
			t.Errorf("IsEditEnabled(%d) = true for built-in %q, want false (UI defence in depth)", idx, presets[idx].Name)
		}
		if panel.IsDeleteEnabled(idx) {
			t.Errorf("IsDeleteEnabled(%d) = true for built-in %q, want false (UI defence in depth)", idx, presets[idx].Name)
		}
	}

	// Custom (row 2): edit and delete must be enabled.
	if !panel.IsEditEnabled(2) {
		t.Errorf("IsEditEnabled(2) = false for custom %q, want true", presets[2].Name)
	}
	if !panel.IsDeleteEnabled(2) {
		t.Errorf("IsDeleteEnabled(2) = false for custom %q, want true", presets[2].Name)
	}
}

// TestSettingsPresetPanel_DeleteCustomPresetCallsModel verifies that
// TriggerDelete on a custom preset row invokes
// PresetManagementModel.DeletePreset with the matching preset ID, then
// auto-refreshes so the snapshot reflects the deletion.
// (test-strategy §5 Phase 3 "edit/delete FSM".)
func TestSettingsPresetPanel_DeleteCustomPresetCallsModel(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	presets := []*db.Preset{
		{ID: 1, Name: "YouTube 1080p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{ID: 42, Name: "My Custom", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 3_000_000, Width: 1280, Height: 720, IsBuiltin: false},
	}
	m := &stubPresetManagementModel{presets: presets}

	panel := NewSettingsPresetPanel(m)
	if err := panel.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh error = %v", err)
	}

	initialListCalls := m.listCalls

	if err := panel.TriggerDelete(1); err != nil {
		t.Fatalf("TriggerDelete(1) error = %v", err)
	}

	if len(m.recordedDeletes) != 1 {
		t.Fatalf("model.DeletePreset called %d times, want 1", len(m.recordedDeletes))
	}
	if m.recordedDeletes[0] != 42 {
		t.Errorf("model.DeletePreset called with id=%d, want 42 (custom preset's ID)", m.recordedDeletes[0])
	}

	// Panel must auto-refresh after a successful delete so the snapshot
	// reflects the new state.
	if m.listCalls <= initialListCalls {
		t.Errorf("listCalls after delete = %d, want > %d (panel must auto-refresh)", m.listCalls, initialListCalls)
	}
	snapshot := panel.Snapshot()
	if len(snapshot) != 1 {
		t.Errorf("Snapshot after delete = %d entries, want 1 (only built-in remains)", len(snapshot))
	} else if snapshot[0].ID != 1 {
		t.Errorf("Snapshot after delete: remaining ID = %d, want 1 (built-in)", snapshot[0].ID)
	}
}

// TestSettingsPresetPanel_DeleteBuiltinRejectedAtUI verifies that
// TriggerDelete on a built-in row returns an error and does NOT call
// the model. This is the UI-level defence in depth required by
// test-strategy §3 cross-phase "Built-in immutability".
func TestSettingsPresetPanel_DeleteBuiltinRejectedAtUI(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	presets := []*db.Preset{
		{ID: 1, Name: "YouTube 1080p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
	}
	m := &stubPresetManagementModel{presets: presets}

	panel := NewSettingsPresetPanel(m)
	if err := panel.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh error = %v", err)
	}

	if err := panel.TriggerDelete(0); err == nil {
		t.Error("TriggerDelete(0) on built-in succeeded, want validation error")
	}
	if len(m.recordedDeletes) != 0 {
		t.Errorf("model.DeletePreset called %d times for built-in, want 0 (UI must block before calling model)", len(m.recordedDeletes))
	}

	// The panel snapshot must still contain the built-in.
	if len(panel.Snapshot()) != 1 {
		t.Errorf("Snapshot after rejected delete = %d, want 1 (built-in must still be present)", len(panel.Snapshot()))
	}
}

// TestSettingsPresetPanel_EditCustomPresetCallsModel verifies that
// TriggerEdit on a custom preset row invokes
// PresetManagementModel.UpdatePreset with the updated name and
// description, preserving the other fields (container, codec, bitrate,
// resolution) and keeping IsBuiltin=false. Panel must auto-refresh
// after the successful edit. (test-strategy §5 Phase 3 "edit/delete
// FSM".)
func TestSettingsPresetPanel_EditCustomPresetCallsModel(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	presets := []*db.Preset{
		{ID: 1, Name: "YouTube 1080p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
		{ID: 42, Name: "Old Name", Description: "old description", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 3_000_000, Width: 1280, Height: 720, IsBuiltin: false},
	}
	m := &stubPresetManagementModel{presets: presets}

	panel := NewSettingsPresetPanel(m)
	if err := panel.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh error = %v", err)
	}

	initialListCalls := m.listCalls

	if err := panel.TriggerEdit(1, "New Name", "new description"); err != nil {
		t.Fatalf("TriggerEdit(1) error = %v", err)
	}

	if len(m.recordedUpdates) != 1 {
		t.Fatalf("model.UpdatePreset called %d times, want 1", len(m.recordedUpdates))
	}
	got := m.recordedUpdates[0]
	if got.ID != 42 {
		t.Errorf("recorded update ID = %d, want 42", got.ID)
	}
	if got.Name != "New Name" {
		t.Errorf("recorded update Name = %q, want %q", got.Name, "New Name")
	}
	if got.Description != "new description" {
		t.Errorf("recorded update Description = %q, want %q", got.Description, "new description")
	}
	// The other fields must be preserved from the original preset.
	if got.Container != db.PresetContainerMP4 {
		t.Errorf("recorded update Container = %q, want %q (must preserve)", got.Container, db.PresetContainerMP4)
	}
	if got.VideoCodec != "h264" {
		t.Errorf("recorded update VideoCodec = %q, want %q (must preserve)", got.VideoCodec, "h264")
	}
	if got.AudioCodec != "aac" {
		t.Errorf("recorded update AudioCodec = %q, want %q (must preserve)", got.AudioCodec, "aac")
	}
	if got.Bitrate != 3_000_000 {
		t.Errorf("recorded update Bitrate = %d, want %d (must preserve)", got.Bitrate, 3_000_000)
	}
	if got.Width != 1280 || got.Height != 720 {
		t.Errorf("recorded update resolution = %dx%d, want 1280x720 (must preserve)", got.Width, got.Height)
	}
	if got.IsBuiltin {
		t.Error("recorded update IsBuiltin = true, want false (edits must keep custom presets custom)")
	}

	// Panel must auto-refresh after a successful edit so the snapshot
	// reflects the renamed preset.
	if m.listCalls <= initialListCalls {
		t.Errorf("listCalls after edit = %d, want > %d (panel must auto-refresh)", m.listCalls, initialListCalls)
	}
	snapshot := panel.Snapshot()
	if len(snapshot) != 2 {
		t.Fatalf("Snapshot after edit = %d entries, want 2", len(snapshot))
	}
	// Find the renamed preset and verify the name is updated.
	found := false
	for _, p := range snapshot {
		if p.ID == 42 && p.Name == "New Name" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Snapshot after edit does not contain the renamed preset (ID=42, Name=New Name)")
	}
}

// TestSettingsPresetPanel_EditBuiltinRejectedAtUI verifies that
// TriggerEdit on a built-in row returns an error and does NOT call the
// model. This is the UI-level defence in depth required by
// test-strategy §3 cross-phase "Built-in immutability".
func TestSettingsPresetPanel_EditBuiltinRejectedAtUI(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	presets := []*db.Preset{
		{ID: 1, Name: "YouTube 1080p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
	}
	m := &stubPresetManagementModel{presets: presets}

	panel := NewSettingsPresetPanel(m)
	if err := panel.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh error = %v", err)
	}

	if err := panel.TriggerEdit(0, "Hijack Attempt", "evil"); err == nil {
		t.Error("TriggerEdit(0) on built-in succeeded, want validation error")
	}
	if len(m.recordedUpdates) != 0 {
		t.Errorf("model.UpdatePreset called %d times for built-in, want 0 (UI must block before calling model)", len(m.recordedUpdates))
	}

	// Built-in must remain unchanged in snapshot.
	snapshot := panel.Snapshot()
	if len(snapshot) != 1 || snapshot[0].Name != "YouTube 1080p" {
		t.Errorf("Snapshot after rejected edit = %v, want one entry still named 'YouTube 1080p'", snapshot)
	}
}

// TestSettingsPresetPanel_EditValidatesName verifies that TriggerEdit
// rejects invalid names (empty, whitespace-only, embedded \n / \r)
// before calling the model. Mirrors the validation in
// ExportDialog.SaveCurrentAsCustomPreset (internal/ui/exportdialog.go:419)
// and the repository's validatePreset (internal/db/preset_repository.go:342).
// test-strategy §3 path safety.
func TestSettingsPresetPanel_EditValidatesName(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	presets := []*db.Preset{
		{ID: 42, Name: "Custom", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 3_000_000, Width: 1280, Height: 720, IsBuiltin: false},
	}
	m := &stubPresetManagementModel{presets: presets}

	panel := NewSettingsPresetPanel(m)
	if err := panel.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh error = %v", err)
	}

	for _, name := range []string{"", "   ", "\t", "bad\nname", "bad\rname", "bad\r\nname"} {
		if err := panel.TriggerEdit(0, name, "desc"); err == nil {
			t.Errorf("TriggerEdit(name=%q) succeeded, want validation error", name)
		}
	}

	if len(m.recordedUpdates) != 0 {
		t.Errorf("model.UpdatePreset called %d times for invalid names, want 0", len(m.recordedUpdates))
	}
}

// TestSettingsPresetPanel_DeletePropagatesModelError verifies that when
// the model returns an error (e.g., the repository's built-in
// immutability check fires on a race-condition path), the panel
// surfaces the error to the caller rather than swallowing it. This is
// the "defence in depth at the repository layer" leg of test-strategy
// §3 "Built-in immutability".
func TestSettingsPresetPanel_DeletePropagatesModelError(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	presets := []*db.Preset{
		{ID: 42, Name: "Custom", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 3_000_000, Width: 1280, Height: 720, IsBuiltin: false},
	}
	m := &stubPresetManagementModel{
		presets:   presets,
		deleteErr: errors.New("delete preset: built-in presets are immutable"),
	}

	panel := NewSettingsPresetPanel(m)
	if err := panel.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh error = %v", err)
	}

	err := panel.TriggerDelete(0)
	if err == nil {
		t.Fatal("TriggerDelete swallowed model error, want propagation")
	}
}

// TestSettingsPresetPanel_RefreshHandlesModelError verifies that
// Refresh surfaces a model error to the caller. This is required so
// the SettingsWindow can show an error toast / status label when the
// database is unavailable.
func TestSettingsPresetPanel_RefreshHandlesModelError(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	m := &stubPresetManagementModel{
		listErr: errors.New("simulated db error"),
	}

	panel := NewSettingsPresetPanel(m)
	if err := panel.Refresh(context.Background()); err == nil {
		t.Error("Refresh swallowed list error, want propagation")
	}
}

// TestSettingsPresetPanel_IntegratedIntoSettingsWindow verifies that
// SettingsWindow exposes a SetPresetModel method that wires the
// PresetManagementModel into an embedded *SettingsPresetPanel
// accessible via the window's presetPanel field (test-strategy §1
// Phase 3 integration: "SettingsWindow↔Repository (read-only
// built-ins)"). After SetPresetModel + Refresh, the panel snapshot
// must reflect the model's presets in the model's order.
func TestSettingsPresetPanel_IntegratedIntoSettingsWindow(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	gtk.Init()

	parent := gtk.NewWindow()
	defer parent.Close()

	window := NewSettingsWindow(parent)
	if window == nil {
		t.Fatal("NewSettingsWindow returned nil")
	}

	m := &stubPresetManagementModel{
		presets: []*db.Preset{
			{ID: 1, Name: "YouTube 1080p", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 8_000_000, Width: 1920, Height: 1080, IsBuiltin: true},
			{ID: 100, Name: "My Custom", Container: db.PresetContainerMP4, VideoCodec: "h264", AudioCodec: "aac", Bitrate: 3_000_000, Width: 1280, Height: 720, IsBuiltin: false},
		},
	}
	window.SetPresetModel(m)

	if window.presetPanel == nil {
		t.Fatal("SettingsWindow.presetPanel is nil after SetPresetModel — integration is missing")
	}

	if err := window.presetPanel.Refresh(context.Background()); err != nil {
		t.Fatalf("integrated panel Refresh error = %v", err)
	}

	snapshot := window.presetPanel.Snapshot()
	if len(snapshot) != 2 {
		t.Fatalf("integrated panel Snapshot = %d entries, want 2", len(snapshot))
	}
	// Built-in must come first per repository ordering.
	if snapshot[0].Name != "YouTube 1080p" {
		t.Errorf("integrated panel first row = %q, want %q (built-ins first)", snapshot[0].Name, "YouTube 1080p")
	}
	if snapshot[1].Name != "My Custom" {
		t.Errorf("integrated panel second row = %q, want %q", snapshot[1].Name, "My Custom")
	}
}
