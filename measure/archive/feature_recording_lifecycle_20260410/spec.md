# Specification: Recording Data Lifecycle Enhancements

## Overview
This track implements comprehensive data lifecycle management for the Verbal recording library. Users need reliable ways to backup, restore, migrate, and repair their recording database and associated media files. This addresses the "Project Persistence" key feature and enables users to safeguard their work.

## Functional Requirements

### 1. Import/Export System
- **Export Recordings**: Users can export individual recordings or the entire library as a portable archive (ZIP format)
- **Export Contents**: Each export includes:
  - Original media file (MP4/WebM)
  - Transcription data (JSON format with word-level timestamps)
  - Recording metadata (title, description, creation date, duration)
  - Thumbnail image (if generated)
- **Import Recordings**: Users can import previously exported recordings back into the library
- **Import Validation**: Verify file integrity and detect duplicates during import
- **Bulk Operations**: Support importing/exporting multiple recordings at once

### 2. Database Repair Tooling
- **Orphan Detection**: Identify database entries pointing to missing media files
- **Thumbnail Repair**: Regenerate missing or corrupted thumbnails
- **Metadata Repair**: Rebuild metadata from media files when possible (using GStreamer to extract duration, etc.)
- **Transcription Validation**: Verify transcription JSON is parseable and complete
- **Repair Reports**: Generate detailed reports of issues found and actions taken

### 3. Recovery Workflows
- **Missing File Recovery**: When a media file is missing, offer options to:
  - Locate the file manually (file picker)
  - Remove the orphaned database entry
  - Mark recording as "unavailable" (preserving metadata)
- **Auto-Recovery on Startup**: Optionally scan for and report issues on application launch
- **Graceful Degradation**: Library view handles missing files gracefully (grayed out entries with recovery options)

### 4. Backup/Restore
- **Automatic Backups**: Optional periodic backup of the SQLite database
- **Manual Backup**: User-triggered full database backup
- **Restore**: Restore database from backup (with conflict resolution for existing entries)
- **Backup Rotation**: Keep a configurable number of backup versions

## Non-Functional Requirements
- **Performance**: Export/import operations should show progress indicators for large files
- **Integrity**: Checksums (SHA-256) for all exported files to verify integrity
- **Safety**: All destructive operations (delete, overwrite) require confirmation
- **GNOME Integration**: Use GTK file choosers with appropriate filters and default locations

## Acceptance Criteria
- [ ] User can export a single recording to a ZIP file
- [ ] User can export the entire library as a ZIP archive
- [ ] User can import recordings from a ZIP file
- [ ] Duplicate detection prevents importing the same recording twice
- [ ] Repair tool detects and reports orphaned database entries
- [ ] Repair tool can regenerate missing thumbnails
- [ ] Missing media files are handled gracefully in the library view
- [ ] Database backup and restore operations work correctly
- [ ] All operations have appropriate error handling and user feedback
- [ ] Progress indicators shown for long-running operations
- [ ] All new code has >80% test coverage

## Out of Scope
- Cloud backup/sync functionality
- Automatic cloud storage integration
- Cross-device synchronization
- Version control for individual recordings
- Automatic transcription re-generation during repair
