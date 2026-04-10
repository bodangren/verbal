# Current Directive: Recording Data Lifecycle Enhancements

## Active Track
**Track:** Feature - Recording Data Lifecycle Enhancements  
**Started:** 2026-04-10  
**Phase:** Phase 1 Complete (Data Models, Exporter, Importer)

## Completed Work (Phase 1)
- [x] Export data models (ExportManifest, ExportedRecording, ExportedFile)
- [x] Exporter interface with ArchiveExporter implementation (ZIP export)
- [x] Importer interface with ArchiveImporter implementation (ZIP import)
- [x] Duplicate handling strategies (Skip, Replace, Rename)
- [x] SHA-256 checksum verification for data integrity
- [x] Progress callbacks for UI integration
- [x] Comprehensive unit tests with 84.7% coverage

## Next Phase
**Phase 2:** Database Repair and Validation System
- Create DatabaseInspector for issue detection (orphaned recordings, missing thumbnails)
- Create DatabaseRepairer for issue resolution
- Create repair report generation

## Success Criteria
- [ ] User can export single recording to ZIP
- [ ] User can export entire library as ZIP
- [ ] User can import recordings from ZIP
- [ ] Duplicate detection prevents importing same recording twice
- [ ] Repair tool detects orphaned database entries
- [ ] All operations have error handling and user feedback
- [ ] All new code has >80% test coverage
