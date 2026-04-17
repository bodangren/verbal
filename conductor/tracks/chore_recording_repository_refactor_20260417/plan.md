# Plan: RecordingRepository Query/Scan Refactoring

**Status:** IN PROGRESS  
**Created:** 2026-04-17  
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

## Phase 1: Analysis and Design

**Goal:** Identify common patterns and design helper functions

### Tasks
1. [ ] Analyze all 6 methods to identify:
   - Common SELECT column lists
   - Common Scan patterns
   - Common JOIN patterns
   - Differences in WHERE clauses
2. [ ] Design helper function(s):
   - `buildRecordingQuery(whereClause string, args ...interface{}) (string, []interface{})`
   - `scanRecording(row scanner) (*Recording, error)`
3. [ ] Document the refactoring approach

### Definition of Done
- [ ] Analysis document in track folder
- [ ] Helper function signatures designed
- [ ] Plan reviewed and approved (self-review OK for autonomous mode)

---

## Phase 2: Extract Scan Helper

**Goal:** Create a reusable scan function

### Tasks
1. [ ] Define `type scanner interface { Scan(dest ...interface{}) error }` for testability
2. [ ] Create `scanRecording(scanner) (*Recording, error)` function
3. [ ] Extract the full column list as a constant:
   ```go
   const recordingColumns = `r.id, r.file_path, r.file_name, r.duration_ms, 
       r.file_size_bytes, r.created_at, r.updated_at, r.thumbnail_path,
       t.status as transcription_status, t.segments_json as transcription_segments`
   ```
4. [ ] Create `joinTranscription` constant for the LEFT JOIN clause
5. [ ] Unit test the scan helper with mock scanner

### Definition of Done
- [ ] scanRecording function implemented
- [ ] Constants defined for columns and joins
- [ ] Unit tests pass
- [ ] No regression in existing tests

---

## Phase 3: Refactor Query Methods

**Goal:** Replace duplicate code with helper calls

### Tasks
1. [ ] Refactor `GetByID` to use scan helper
2. [ ] Refactor `GetByPathExact` to use scan helper
3. [ ] Refactor `List` to use scan helper
4. [ ] Refactor `ListRecent` to use scan helper
5. [ ] Refactor `SearchByTranscription` to use scan helper
6. [ ] Refactor `SearchByPath` to use scan helper
7. [ ] Verify each method still passes its tests

### Definition of Done
- [ ] All 6 methods refactored
- [ ] All existing tests pass
- [ ] Code coverage maintained or improved
- [ ] ~200 lines of duplication removed

---

## Phase 4: Build and Test Verification

**Goal:** Ensure no regressions

### Tasks
1. [ ] Run full test suite: `go test ./internal/db/... -v`
2. [ ] Run race detector: `go test -race ./internal/db/...`
3. [ ] Run build: `go build ./...`
4. [ ] Run linter: `go vet ./internal/db/...`
5. [ ] Count lines before/after for verification

### Definition of Done
- [ ] All tests pass
- [ ] No race conditions
- [ ] Build succeeds
- [ ] Linter passes
- [ ] Line count reduced by ~200 lines

---

## Phase 5: Documentation and Cleanup

**Goal:** Update documentation and close track

### Tasks
1. [ ] Update repository.go function documentation if needed
2. [ ] Update lessons-learned.md with refactoring patterns
3. [ ] Update tech-debt.md to mark issue as resolved
4. [ ] Update tracks.md to mark track as complete
5. [ ] Commit all changes with descriptive message

### Definition of Done
- [ ] Documentation updated
- [ ] Tech debt marked resolved
- [ ] Track marked complete
- [ ] Changes committed and pushed

---

## Metrics

- **Target:** Remove ~200 lines of duplicate code
- **Test Coverage:** Maintain or improve current coverage
- **Risk:** Low - refactoring only, no behavior changes

---

## Notes

- This is a pure refactoring - no behavior changes expected
- All existing tests should continue to pass without modification
- Consider using sqlx or similar in future for struct scanning
