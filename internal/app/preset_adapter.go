package app

import (
	"context"
	"fmt"

	"verbal/internal/db"
)

type presetRepositoryAdapter struct {
	repo *db.PresetRepository
}

func newPresetRepositoryAdapter(database *db.Database) *presetRepositoryAdapter {
	if database == nil {
		return nil
	}
	return &presetRepositoryAdapter{repo: database.PresetRepo()}
}

func (a *presetRepositoryAdapter) ListPresets(ctx context.Context) ([]*db.Preset, error) {
	if a == nil || a.repo == nil {
		return nil, fmt.Errorf("preset adapter: repository unavailable")
	}
	return a.repo.List()
}

func (a *presetRepositoryAdapter) SaveCustomPreset(ctx context.Context, p *db.Preset) error {
	if a == nil || a.repo == nil {
		return fmt.Errorf("preset adapter: repository unavailable")
	}
	p.IsBuiltin = false
	_, err := a.repo.Create(p)
	return err
}

func (a *presetRepositoryAdapter) UpdatePreset(ctx context.Context, p *db.Preset) error {
	if a == nil || a.repo == nil {
		return fmt.Errorf("preset adapter: repository unavailable")
	}
	p.IsBuiltin = false
	return a.repo.Update(p)
}

func (a *presetRepositoryAdapter) DeletePreset(ctx context.Context, id int64) error {
	if a == nil || a.repo == nil {
		return fmt.Errorf("preset adapter: repository unavailable")
	}
	return a.repo.Delete(id)
}
