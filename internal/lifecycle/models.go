// Package lifecycle provides import/export, repair, and backup functionality
// for recording data lifecycle management.
package lifecycle

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// ExportManifest represents the top-level structure of an exported recording archive.
type ExportManifest struct {
	Version    string               `json:"version"`
	ExportedAt time.Time            `json:"exported_at"`
	Recording  *ExportedRecording   `json:"recording,omitempty"`
	Recordings []*ExportedRecording `json:"recordings,omitempty"`
}

// ExportedRecording represents a single recording within an export archive.
type ExportedRecording struct {
	ID            string        `json:"id"`
	Title         string        `json:"title"`
	Description   string        `json:"description,omitempty"`
	CreatedAt     time.Time     `json:"created_at"`
	Duration      int64         `json:"duration_ms"`
	MediaFile     *ExportedFile `json:"media_file"`
	Transcription *ExportedFile `json:"transcription,omitempty"`
	Thumbnail     *ExportedFile `json:"thumbnail,omitempty"`
}

// ExportedFile represents a file within an export archive with its metadata.
type ExportedFile struct {
	Filename string `json:"filename"`
	Size     int64  `json:"size_bytes"`
	Checksum string `json:"checksum_sha256"`
}

// ExportFormatVersion is the current export format version.
const ExportFormatVersion = "1.0"

// NewExportManifest creates a new export manifest for a single recording.
func NewExportManifest(recording *ExportedRecording) *ExportManifest {
	return &ExportManifest{
		Version:    ExportFormatVersion,
		ExportedAt: time.Now().UTC(),
		Recording:  recording,
	}
}

// NewBulkExportManifest creates a new export manifest for multiple recordings.
func NewBulkExportManifest(recordings []*ExportedRecording) *ExportManifest {
	return &ExportManifest{
		Version:    ExportFormatVersion,
		ExportedAt: time.Now().UTC(),
		Recordings: recordings,
	}
}

// Validate checks the manifest for required fields and consistency.
func (m *ExportManifest) Validate() error {
	if m.Version == "" {
		return fmt.Errorf("version is required")
	}
	if m.Version != ExportFormatVersion {
		return fmt.Errorf("unsupported export version: %s", m.Version)
	}
	if m.ExportedAt.IsZero() {
		return fmt.Errorf("exported_at is required")
	}
	if m.Recording == nil && (m.Recordings == nil || len(m.Recordings) == 0) {
		return fmt.Errorf("at least one recording is required")
	}

	recordings := m.Recordings
	if m.Recording != nil {
		recordings = []*ExportedRecording{m.Recording}
	}

	for i, rec := range recordings {
		if err := rec.Validate(); err != nil {
			return fmt.Errorf("recording %d: %w", i, err)
		}
	}

	return nil
}

// Validate checks the exported recording for required fields.
func (r *ExportedRecording) Validate() error {
	if r.ID == "" {
		return fmt.Errorf("id is required")
	}
	if r.Title == "" {
		return fmt.Errorf("title is required")
	}
	if r.MediaFile == nil {
		return fmt.Errorf("media_file is required")
	}
	if err := r.MediaFile.Validate(); err != nil {
		return fmt.Errorf("media_file: %w", err)
	}
	if r.Transcription != nil {
		if err := r.Transcription.Validate(); err != nil {
			return fmt.Errorf("transcription: %w", err)
		}
	}
	if r.Thumbnail != nil {
		if err := r.Thumbnail.Validate(); err != nil {
			return fmt.Errorf("thumbnail: %w", err)
		}
	}
	return nil
}

// Validate checks the exported file for required fields.
func (f *ExportedFile) Validate() error {
	if f.Filename == "" {
		return fmt.Errorf("filename is required")
	}
	if f.Size < 0 {
		return fmt.Errorf("size_bytes cannot be negative")
	}
	if f.Checksum == "" {
		return fmt.Errorf("checksum_sha256 is required")
	}
	return nil
}

// Serialize converts the manifest to JSON bytes.
func (m *ExportManifest) Serialize() ([]byte, error) {
	return json.MarshalIndent(m, "", "  ")
}

// DeserializeManifest parses JSON bytes into an ExportManifest.
func DeserializeManifest(data []byte) (*ExportManifest, error) {
	var manifest ExportManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("failed to deserialize manifest: %w", err)
	}
	return &manifest, nil
}

// CalculateChecksum computes the SHA-256 checksum of data.
func CalculateChecksum(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// CalculateChecksumFromString computes the SHA-256 checksum of a string.
func CalculateChecksumFromString(s string) string {
	return CalculateChecksum([]byte(s))
}
