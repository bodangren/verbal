# Current Directive: RecordingRepository Query/Scan Refactoring

## Status: IN PROGRESS

**Track:** Chore - RecordingRepository Query/Scan Refactoring  
**Started:** 2026-04-17  
**Focus:** Reduce ~200 lines of duplication in `internal/db/repository.go` by extracting common query/scan patterns.

---

## Problem Statement

`internal/db/repository.go` has near-identical SELECT column lists and Scan blocks across 6 methods:
- `List`
- `SearchByTranscription`
- `SearchByPath`
- `ListRecent`
- `GetByID`
- `GetByPathExact`

This creates maintenance burden and risk of drift bugs when schema changes.

---

## Current Phase: Phase 1 - Analysis and Design

### Tasks In Progress
1. [ ] Analyze all 6 methods to identify common patterns
2. [ ] Design helper function signatures
3. [ ] Document the refactoring approach

### Next Steps
Complete Phase 1 analysis and begin Phase 2 implementation.

---

## Expected Outcomes

- ~200 lines of duplicate code removed
- All existing tests continue to pass
- No behavior changes (pure refactoring)
- Improved maintainability
