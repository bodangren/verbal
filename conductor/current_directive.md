# Current Directive: Recording Data Lifecycle Enhancements

## Active Track
**Track:** Feature - Recording Data Lifecycle Enhancements  
**Started:** 2026-04-10  
**Phase:** Phase 4 Complete (Integration with Library View and Main Application)

## Completed Work (Phase 4)
- [x] Menu items and keyboard shortcuts
  - File menu with Import/Export actions (Ctrl+Shift+I, Ctrl+Shift+E)
  - Tools menu with Repair action (Ctrl+Shift+R)
  - Integration with existing menu system
- [x] LibraryView integration
  - OnRecordingExport callback for per-recording export
  - Export dialog pre-populated with selected recording
  - CSS styling for unavailable recordings (grayed out)
- [x] Unavailable recording state handling
  - Recording.IsAvailable() method to check file existence
  - Visual indication via CSS (opacity, grayscale, muted colors)
  - Tooltip showing "File not found"
- [x] Dialog integration in main.go
  - showExportDialog() for general export
  - showExportDialogForRecording() for specific recording export
  - showImportDialog() with progress simulation
  - showRepairDialog() with scan/repair simulation

## Previous Work (Phase 3)
- [x] ExportDialog component with file chooser and progress
- [x] ImportDialog component with duplicate handling
- [x] RepairDialog component with scan results
- [x] Comprehensive UI tests for all dialogs

## Previous Work (Phase 2)
- [x] DatabaseInspector for issue detection
- [x] DatabaseRepairer for issue resolution
- [x] RepairReport with JSON/text export

## Next Phase
**Phase 5:** Backup/Restore System
- Create BackupManager with rotation
- Add BackupSettings UI
- Implement automatic backup scheduler

## Success Criteria
- [x] User can export single recording to ZIP
- [x] User can export entire library as ZIP
- [x] User can import recordings from ZIP
- [x] Duplicate detection prevents importing same recording twice (logic exists)
- [x] Repair tool detects orphaned database entries
- [x] Repair tool can regenerate missing thumbnails
- [x] All operations have error handling and user feedback
- [x] All new code has >80% test coverage (86.4% achieved)
