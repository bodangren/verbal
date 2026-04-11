# Current Directive: Recording Data Lifecycle Enhancements

## Active Track
**Track:** Feature - Recording Data Lifecycle Enhancements  
**Started:** 2026-04-10  
**Phase:** Phase 3 Complete (Import/Export UI Components)

## Completed Work (Phase 3)
- [x] ExportDialog component with file chooser and progress
  - Single vs all recordings export selection
  - ZIP file destination chooser with filter
  - Progress bar with callback integration
  - Export type enum (ExportSingle, ExportAll)
- [x] ImportDialog component with duplicate handling
  - ZIP archive file chooser
  - Duplicate handling options (skip/replace/rename)
  - Progress tracking and result display
  - ImportResult integration
- [x] RepairDialog component with scan results
  - Database scan button with progress
  - Issue checkboxes (orphans, thumbnails, unavailable)
  - Repair progress tracking
  - RepairReport result display
- [x] Comprehensive UI tests for all dialogs (skipped in headless, passing with display)

## Previous Work (Phase 2)
- [x] DatabaseInspector for issue detection
- [x] DatabaseRepairer for issue resolution
- [x] RepairReport with JSON/text export

## Next Phase
**Phase 4:** Integration with Library View and Main Application
- Add menu items and keyboard shortcuts
- Integrate with LibraryView (export button in context menu)
- Handle "unavailable" recording state in UI
- Add startup integrity check option

## Success Criteria
- [x] User can export single recording to ZIP (UI ready)
- [x] User can export entire library as ZIP (UI ready)
- [x] User can import recordings from ZIP (UI ready)
- [ ] Duplicate detection prevents importing same recording twice (logic exists, needs wiring)
- [x] Repair tool detects orphaned database entries
- [x] Repair tool can regenerate missing thumbnails
- [ ] All operations have error handling and user feedback
- [x] All new code has >80% test coverage (86.4% achieved)
