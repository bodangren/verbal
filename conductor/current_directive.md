# Current Directive: Recording Data Lifecycle Enhancements

## Active Track
**Track:** Feature - Recording Data Lifecycle Enhancements  
**Started:** 2026-04-10  
**Phase:** Phase 2 Complete (Database Repair and Validation System)

## Completed Work (Phase 2)
- [x] DatabaseInspector for issue detection
  - CheckOrphanedRecordings() - finds DB entries without media files
  - CheckMissingThumbnails() - finds recordings without thumbnails
  - CheckInvalidTranscriptions() - validates JSON parseability
  - RunAllChecks() - comprehensive inspection report
- [x] DatabaseRepairer for issue resolution
  - RemoveOrphanedEntry() - deletes DB entry for missing file
  - MarkAsUnavailable() - flags recording with missing media
  - RegenerateThumbnail() - recreates missing thumbnails
  - RepairAll() - batch repairs based on inspection report
- [x] RepairReport with JSON/text export
  - ToJSON() for machine-readable reports
  - ToText() for human-readable reports
  - SaveToFile() for persistence
- [x] Comprehensive unit tests (86.4% coverage on lifecycle package)

## Next Phase
**Phase 3:** Import/Export UI Components
- Create ExportDialog component with file chooser and progress
- Create ImportDialog component with duplicate handling options
- Create RepairDialog component with scan results and repair options

## Success Criteria
- [ ] User can export single recording to ZIP
- [ ] User can export entire library as ZIP
- [ ] User can import recordings from ZIP
- [ ] Duplicate detection prevents importing same recording twice
- [x] Repair tool detects orphaned database entries
- [x] Repair tool can regenerate missing thumbnails
- [ ] All operations have error handling and user feedback
- [x] All new code has >80% test coverage (86.4% achieved)
