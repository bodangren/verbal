# Implementation Plan: Recording Data Lifecycle Enhancements

## Phase 1: Import/Export Data Models and Core Logic

**Objective**: Establish the foundational data structures and interfaces for import/export operations.

- [x] Task: Create export data models and manifest structure [88ae180]
  - [x] Write unit tests for model validation
  - [x] Implement manifest serialization/deserialization (JSON)

- [x] Task: Create Exporter interface and basic implementation [243743e]
  - [x] Define Exporter interface with Export(recordingID) and ExportAll() methods
  - [x] Implement ArchiveExporter using archive/zip
  - [x] Add progress callback support for UI updates
  - [x] Write unit tests with mock filesystem

- [x] Task: Create Importer interface and basic implementation [4461c1a]
  - [x] Define Importer interface with Import(archivePath) method
  - [x] Implement ArchiveImporter with ZIP extraction
  - [x] Add duplicate detection logic (by file hash)
  - [x] Write unit tests for import validation

## Phase 2: Database Repair and Validation System

**Objective**: Implement detection and repair capabilities for database integrity issues.

- [x] Task: Create DatabaseInspector for issue detection [9ee01ee]
  - [x] Implement CheckOrphanedRecordings() - find DB entries without media files
  - [x] Implement CheckMissingThumbnails() - find recordings without thumbnails
  - [x] Implement CheckInvalidTranscriptions() - validate JSON parseability
  - [x] Write unit tests for each check function

- [x] Task: Create DatabaseRepairer for issue resolution [ba51527]
  - [x] Implement RemoveOrphanedEntry() - delete DB entry for missing file
  - [x] Implement MarkAsUnavailable() - flag recording with missing media
  - [x] Implement RegenerateThumbnail() - recreate missing thumbnails
  - [x] Write unit tests for repair operations

- [x] Task: Create repair report generation [1126a38]
  - [x] Define RepairReport struct with issue counts and actions taken
  - [x] Implement JSON/text report export
  - [x] Write unit tests for report generation

## Phase 3: Import/Export UI Components

**Objective**: Build GTK4 UI for import/export operations.

- [x] Task: Create ExportDialog component
  - [x] Design dialog UI with single vs all recordings selection
  - [x] Add destination folder chooser
  - [x] Integrate progress bar with exporter callbacks
  - [x] Write tests for dialog interactions

- [x] Task: Create ImportDialog component
  - [x] Design dialog UI with file chooser (ZIP filter)
  - [x] Add duplicate handling options (skip/rename/overwrite)
  - [x] Integrate progress bar with importer callbacks
  - [x] Write tests for dialog interactions

- [x] Task: Create RepairDialog component
  - [x] Design dialog showing scan results
  - [x] Add checkboxes for selecting which issues to repair
  - [x] Show repair progress and final report
  - [x] Write tests for dialog interactions

## Phase 4: Integration with Library View and Main Application

**Objective**: Wire import/export/repair features into the main application.

- [x] Task: Add menu items and keyboard shortcuts
  - [x] Add File menu with Import/Export/Backup options
  - [x] Add Tools menu with Repair option
  - [x] Define keyboard shortcuts (Ctrl+Shift+E for export, etc.)

- [x] Task: Integrate with LibraryView
  - [x] Add export button to recording context menu
  - [x] Handle "unavailable" recording state (grayed out UI)
  - [x] Add recovery option for missing files (locate/remove)

- [x] Task: Add startup integrity check (optional)
  - [x] Create silent integrity check on app launch
  - [x] Show notification if issues found
  - [x] Add setting to enable/disable startup check

## Phase 5: Backup/Restore System

**Objective**: Implement database backup and restore functionality.
**Status**: In Progress

- [~] Task: Create BackupManager
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
