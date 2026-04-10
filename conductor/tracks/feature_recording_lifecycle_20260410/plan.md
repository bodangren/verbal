# Implementation Plan: Recording Data Lifecycle Enhancements

## Phase 1: Import/Export Data Models and Core Logic

**Objective**: Establish the foundational data structures and interfaces for import/export operations.

- [ ] Task: Create export data models and manifest structure
  - [ ] Define ExportManifest struct (version, recordings, checksums)
  - [ ] Define ExportedRecording struct (metadata, file paths)
  - [ ] Write unit tests for model validation
  - [ ] Implement manifest serialization/deserialization (JSON)

- [ ] Task: Create Exporter interface and basic implementation
  - [ ] Define Exporter interface with Export(recordingID) and ExportAll() methods
  - [ ] Implement ArchiveExporter using archive/zip
  - [ ] Add progress callback support for UI updates
  - [ ] Write unit tests with mock filesystem

- [ ] Task: Create Importer interface and basic implementation
  - [ ] Define Importer interface with Import(archivePath) method
  - [ ] Implement ArchiveImporter with ZIP extraction
  - [ ] Add duplicate detection logic (by file hash)
  - [ ] Write unit tests for import validation

## Phase 2: Database Repair and Validation System

**Objective**: Implement detection and repair capabilities for database integrity issues.

- [ ] Task: Create DatabaseInspector for issue detection
  - [ ] Implement CheckOrphanedRecordings() - find DB entries without media files
  - [ ] Implement CheckMissingThumbnails() - find recordings without thumbnails
  - [ ] Implement CheckInvalidTranscriptions() - validate JSON parseability
  - [ ] Write unit tests for each check function

- [ ] Task: Create DatabaseRepairer for issue resolution
  - [ ] Implement RemoveOrphanedEntry() - delete DB entry for missing file
  - [ ] Implement MarkAsUnavailable() - flag recording with missing media
  - [ ] Implement RegenerateThumbnail() - recreate missing thumbnails
  - [ ] Write unit tests for repair operations

- [ ] Task: Create repair report generation
  - [ ] Define RepairReport struct with issue counts and actions taken
  - [ ] Implement JSON/text report export
  - [ ] Write unit tests for report generation

## Phase 3: Import/Export UI Components

**Objective**: Build GTK4 UI for import/export operations.

- [ ] Task: Create ExportDialog component
  - [ ] Design dialog UI with single vs all recordings selection
  - [ ] Add destination folder chooser
  - [ ] Integrate progress bar with exporter callbacks
  - [ ] Write tests for dialog interactions

- [ ] Task: Create ImportDialog component
  - [ ] Design dialog UI with file chooser (ZIP filter)
  - [ ] Add duplicate handling options (skip/rename/overwrite)
  - [ ] Integrate progress bar with importer callbacks
  - [ ] Write tests for dialog interactions

- [ ] Task: Create RepairDialog component
  - [ ] Design dialog showing scan results
  - [ ] Add checkboxes for selecting which issues to repair
  - [ ] Show repair progress and final report
  - [ ] Write tests for dialog interactions

## Phase 4: Integration with Library View and Main Application

**Objective**: Wire import/export/repair features into the main application.

- [ ] Task: Add menu items and keyboard shortcuts
  - [ ] Add File menu with Import/Export/Backup options
  - [ ] Add Tools menu with Repair option
  - [ ] Define keyboard shortcuts (Ctrl+Shift+E for export, etc.)

- [ ] Task: Integrate with LibraryView
  - [ ] Add export button to recording context menu
  - [ ] Handle "unavailable" recording state (grayed out UI)
  - [ ] Add recovery option for missing files (locate/remove)

- [ ] Task: Add startup integrity check (optional)
  - [ ] Create silent integrity check on app launch
  - [ ] Show notification if issues found
  - [ ] Add setting to enable/disable startup check

## Phase 5: Backup/Restore System

**Objective**: Implement database backup and restore functionality.

- [ ] Task: Create BackupManager
  - [ ] Implement CreateBackup() - copy SQLite DB with timestamp
  - [ ] Implement ListBackups() - enumerate backup files
  - [ ] Implement RestoreBackup() - restore from backup file
  - [ ] Implement backup rotation (keep N most recent)
  - [ ] Write unit tests for backup operations

- [ ] Task: Create BackupSettings UI
  - [ ] Add auto-backup enable/disable toggle
  - [ ] Add backup frequency setting (daily/weekly)
  - [ ] Add backup retention count setting
  - [ ] Add manual backup/restore buttons

- [ ] Task: Add automatic backup scheduler
  - [ ] Implement background backup goroutine
  - [ ] Trigger backup based on frequency setting
  - [ ] Handle backup failures gracefully

## Phase 6: Integration Testing and Finalization

**Objective**: Comprehensive testing and quality assurance.

- [ ] Task: Conductor - User Manual Verification 'Phase 1'

- [ ] Task: Conductor - User Manual Verification 'Phase 2'

- [ ] Task: Conductor - User Manual Verification 'Phase 3'

- [ ] Task: Conductor - User Manual Verification 'Phase 4'

- [ ] Task: Conductor - User Manual Verification 'Phase 5'

- [ ] Task: Write integration tests for end-to-end workflows
  - [ ] Test full export → import round-trip
  - [ ] Test repair workflow with simulated corruption
  - [ ] Test backup/restore cycle
  - [ ] Verify all error handling paths

- [ ] Task: Final verification and documentation
  - [ ] Run full test suite: `go test ./...`
  - [ ] Verify build: `go build ./...`
  - [ ] Update lessons-learned.md with key insights
  - [ ] Mark tech-debt items as resolved if applicable
