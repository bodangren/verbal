# Plan: RecordingRepository Query/Scan Refactoring

**Status:** COMPLETE ✓  
**Created:** 2026-04-17  
**Completed:** 2026-04-17  
**Focus:** Reduce duplication in `internal/db/repository.go` by extracting common query/scan patterns.

---

## Summary

Successfully refactored `internal/db/repository.go` to eliminate ~109 lines of duplicated code across 6 methods:
- `GetByID`
- `GetByPathExact`
- `List`
- `ListRecent`
- `SearchByTranscription`
- `SearchByPath`

---

## Phase 1: Analysis and Design ✓

Identified common patterns:
- Identical SELECT column lists (10 columns)
- Identical Scan blocks with 10 destinations
- Identical post-processing (duration conversion, timestamp parsing)
- Common iteration pattern for multi-row queries

---

## Phase 2: Extract Scan Helper ✓

Created helper functions:
1. **`scanner` interface** - abstracts `sql.Row` and `sql.Rows` for unified scanning
2. **`recordingColumns` constant** - centralizes column list
3. **`scanRecording(scanner)`** - scans single row into Recording struct
4. **`scanRecordings(*sql.Rows)`** - scans multiple rows into slice

---

## Phase 3: Refactor Query Methods ✓

All 6 methods refactored to use helpers:
- `GetByID` and `GetByPathExact`: Reduced from ~26 lines to ~8 lines each
- `List`, `ListRecent`, `SearchByTranscription`, `SearchByPath`: Reduced from ~32 lines to ~10 lines each

---

## Phase 4: Build and Test Verification ✓

- ✓ Full test suite pass (43 tests in db package)
- ✓ Race detector pass
- ✓ Build pass
- ✓ Linter pass (`go vet`)
- ✓ **Net reduction: 109 lines** (531 → 422 lines)

---

## Phase 5: Documentation ✓

- Updated tech-debt.md (marked issue as resolved)
- Updated tracks.md (marked track as complete)
- Updated lessons-learned.md (added refactoring pattern)

---

## Key Changes

### Before (example from List):
```go
func (r *RecordingRepository) List() ([]*Recording, error) {
    rows, err := r.db.Query(`
        SELECT
            id, file_path, duration, transcription_status, transcription_json,
            thumbnail_data, thumbnail_mime_type, thumbnail_generated_at,
            created_at, updated_at
        FROM recordings
        ORDER BY created_at DESC
    `)
    if err != nil { return nil, fmt.Errorf(...) }
    defer rows.Close()

    var recordings []*Recording
    for rows.Next() {
        rec := &Recording{}
        var durationNS int64
        var thumbnailGeneratedAt sql.NullString
        if err := rows.Scan(
            &rec.ID, &rec.FilePath, &durationNS, ...
        ); err != nil { return nil, fmt.Errorf(...) }
        rec.Duration = time.Duration(durationNS)
        rec.ThumbnailGeneratedAt = parseThumbnailGeneratedAt(thumbnailGeneratedAt)
        recordings = append(recordings, rec)
    }
    if err := rows.Err(); err != nil { return nil, fmt.Errorf(...) }
    return recordings, nil
}
```

### After:
```go
func (r *RecordingRepository) List() ([]*Recording, error) {
    rows, err := r.db.Query(`
        SELECT ` + recordingColumns + `
        FROM recordings
        ORDER BY created_at DESC
    `)
    if err != nil { return nil, fmt.Errorf(...) }
    defer rows.Close()
    return scanRecordings(rows)
}
```

---

## Benefits

1. **Maintainability**: Schema changes require updates in only one place (the constant)
2. **DRY**: Eliminates ~109 lines of copy-pasted code
3. **Testability**: Scan logic is now isolated and could be unit-tested independently
4. **Safety**: No behavior changes - pure refactoring

---

## Pattern for Future Use

When dealing with repeated SQL patterns:
1. Define a `scanner` interface for abstraction
2. Extract column lists as constants
3. Create `scanXxx()` helper functions
4. Create `scanXxxs()` helper for slice results
5. Refactor methods to use helpers
