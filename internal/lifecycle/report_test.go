package lifecycle

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"verbal/internal/db"
)

func TestInspectionReport_ToJSON(t *testing.T) {
	report := &InspectionReport{
		TotalIssues: 3,
		OrphanedRecordings: []*db.Recording{
			{ID: 1, FilePath: "/path/to/missing.mp4"},
		},
		MissingThumbnails: []*db.Recording{
			{ID: 2, FilePath: "/path/to/no-thumb.mp4"},
		},
		InvalidTranscriptions: []*db.Recording{
			{ID: 3, FilePath: "/path/to/bad-json.mp4"},
		},
	}

	jsonData, err := report.ToJSON()
	if err != nil {
		t.Fatalf("ToJSON failed: %v", err)
	}

	// Verify it's valid JSON
	var result map[string]interface{}
	if err := json.Unmarshal(jsonData, &result); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}

	// Check fields
	if result["total_issues"] != float64(3) {
		t.Errorf("expected total_issues = 3, got %v", result["total_issues"])
	}

	orphaned, ok := result["orphaned_recordings"].([]interface{})
	if !ok || len(orphaned) != 1 {
		t.Errorf("expected 1 orphaned recording in JSON, got %v", orphaned)
	}

	missingThumbs, ok := result["missing_thumbnails"].([]interface{})
	if !ok || len(missingThumbs) != 1 {
		t.Errorf("expected 1 missing thumbnail in JSON, got %v", missingThumbs)
	}

	invalidTrans, ok := result["invalid_transcriptions"].([]interface{})
	if !ok || len(invalidTrans) != 1 {
		t.Errorf("expected 1 invalid transcription in JSON, got %v", invalidTrans)
	}
}

func TestInspectionReport_ToText(t *testing.T) {
	createdAt := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)

	report := &InspectionReport{
		TotalIssues: 3,
		OrphanedRecordings: []*db.Recording{
			{ID: 1, FilePath: "/path/to/missing.mp4", CreatedAt: createdAt},
		},
		MissingThumbnails: []*db.Recording{
			{ID: 2, FilePath: "/path/to/no-thumb.mp4", CreatedAt: createdAt},
		},
		InvalidTranscriptions: []*db.Recording{
			{ID: 3, FilePath: "/path/to/bad-json.mp4", CreatedAt: createdAt},
		},
	}

	text := report.ToText()

	// Check that the text report contains expected sections
	if !strings.Contains(text, "DATABASE INSPECTION REPORT") {
		t.Error("expected report to contain header")
	}

	if !strings.Contains(text, "Total Issues: 3") {
		t.Error("expected report to contain total issues count")
	}

	if !strings.Contains(text, "ORPHANED RECORDINGS") {
		t.Error("expected report to contain orphaned recordings section")
	}

	if !strings.Contains(text, "MISSING THUMBNAILS") {
		t.Error("expected report to contain missing thumbnails section")
	}

	if !strings.Contains(text, "INVALID TRANSCRIPTIONS") {
		t.Error("expected report to contain invalid transcriptions section")
	}

	if !strings.Contains(text, "/path/to/missing.mp4") {
		t.Error("expected report to contain orphaned file path")
	}
}

func TestInspectionReport_ToText_Empty(t *testing.T) {
	report := &InspectionReport{
		TotalIssues: 0,
	}

	text := report.ToText()

	if !strings.Contains(text, "No issues found") {
		t.Error("expected empty report to indicate no issues")
	}
}

func TestRepairReport_ToJSON(t *testing.T) {
	report := &RepairReport{
		TotalRepairs:          2,
		RemovedOrphans:        []int64{1},
		RegeneratedThumbnails: []int64{2},
		Errors:                []string{"failed to fix recording 3: some error"},
	}

	jsonData, err := report.ToJSON()
	if err != nil {
		t.Fatalf("ToJSON failed: %v", err)
	}

	// Verify it's valid JSON
	var result map[string]interface{}
	if err := json.Unmarshal(jsonData, &result); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}

	// Check fields
	if result["total_repairs"] != float64(2) {
		t.Errorf("expected total_repairs = 2, got %v", result["total_repairs"])
	}

	removed, ok := result["removed_orphans"].([]interface{})
	if !ok || len(removed) != 1 {
		t.Errorf("expected 1 removed orphan in JSON, got %v", removed)
	}

	regenerated, ok := result["regenerated_thumbnails"].([]interface{})
	if !ok || len(regenerated) != 1 {
		t.Errorf("expected 1 regenerated thumbnail in JSON, got %v", regenerated)
	}

	errors, ok := result["errors"].([]interface{})
	if !ok || len(errors) != 1 {
		t.Errorf("expected 1 error in JSON, got %v", errors)
	}
}

func TestRepairReport_ToText(t *testing.T) {
	report := &RepairReport{
		TotalRepairs:          2,
		RemovedOrphans:        []int64{1},
		RegeneratedThumbnails: []int64{2},
		Errors:                []string{"failed to fix recording 3: some error"},
	}

	text := report.ToText()

	// Check that the text report contains expected sections
	if !strings.Contains(text, "DATABASE REPAIR REPORT") {
		t.Error("expected report to contain header")
	}

	if !strings.Contains(text, "Total Repairs: 2") {
		t.Error("expected report to contain total repairs count")
	}

	if !strings.Contains(text, "Removed Orphans: 1") {
		t.Error("expected report to contain removed orphans count")
	}

	if !strings.Contains(text, "Regenerated Thumbnails: 1") {
		t.Error("expected report to contain regenerated thumbnails count")
	}

	if !strings.Contains(text, "ERRORS") {
		t.Error("expected report to contain errors section")
	}

	if !strings.Contains(text, "failed to fix recording 3") {
		t.Error("expected report to contain error message")
	}
}

func TestRepairReport_ToText_NoErrors(t *testing.T) {
	report := &RepairReport{
		TotalRepairs:          1,
		RemovedOrphans:        []int64{1},
		RegeneratedThumbnails: []int64{},
		Errors:                []string{},
	}

	text := report.ToText()

	if !strings.Contains(text, "No errors") {
		t.Error("expected report to indicate no errors")
	}
}

func TestInspectionReport_SaveToFile(t *testing.T) {
	tmpDir := t.TempDir()
	reportPath := filepath.Join(tmpDir, "inspection.json")

	report := &InspectionReport{
		TotalIssues: 1,
		OrphanedRecordings: []*db.Recording{
			{ID: 1, FilePath: "/path/to/missing.mp4"},
		},
	}

	if err := report.SaveToFile(reportPath); err != nil {
		t.Fatalf("SaveToFile failed: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(reportPath); os.IsNotExist(err) {
		t.Error("report file was not created")
	}

	// Verify file content
	data, err := os.ReadFile(reportPath)
	if err != nil {
		t.Fatalf("failed to read report file: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("saved file is not valid JSON: %v", err)
	}

	if result["total_issues"] != float64(1) {
		t.Errorf("expected total_issues = 1 in saved file, got %v", result["total_issues"])
	}
}

func TestRepairReport_SaveToFile(t *testing.T) {
	tmpDir := t.TempDir()
	reportPath := filepath.Join(tmpDir, "repair.json")

	report := &RepairReport{
		TotalRepairs:   1,
		RemovedOrphans: []int64{1},
	}

	if err := report.SaveToFile(reportPath); err != nil {
		t.Fatalf("SaveToFile failed: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(reportPath); os.IsNotExist(err) {
		t.Error("report file was not created")
	}

	// Verify file content
	data, err := os.ReadFile(reportPath)
	if err != nil {
		t.Fatalf("failed to read report file: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("saved file is not valid JSON: %v", err)
	}

	if result["total_repairs"] != float64(1) {
		t.Errorf("expected total_repairs = 1 in saved file, got %v", result["total_repairs"])
	}
}

func TestInspectionReport_SaveToFile_InvalidPath(t *testing.T) {
	report := &InspectionReport{
		TotalIssues: 1,
	}

	// Try to save to an invalid path
	err := report.SaveToFile("/nonexistent/directory/report.json")
	if err == nil {
		t.Error("expected error when saving to invalid path")
	}
}
