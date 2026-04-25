# Implementation Plan

## Phase 1: Audit Repository Initialization Patterns

### Task 1.1: Find all repository struct initializations
- [x] Search for `&.*Repository{}` pattern across all Go files
- [x] Search for `&.*Repo{}` pattern (abbreviated names)
- [x] List all findings with file:line context

### Task 1.2: Review each initialization
- [x] For each finding, check if it's in production code or test code
- [x] If production code, verify proper factory method is used (or that nil is intentional)
- [x] Document any issues found

### Task 1.3: Audit all Database method wrappers
- [x] List all methods on `*db.Database` that return repository instances
- [x] Verify each method properly initializes the repository with the DB connection
- [x] Check for any new repository types added since last audit

## Phase 2: Fix Issues (if any found)

### Task 2.1: Fix improper initializations
- [x] No issues found - all production code uses proper factory methods

### Task 2.2: Add defensive tests
- [x] No new issue patterns found

## Phase 3: Verification

### Task 3.1: Run full test suite
- [x] `go test ./... -count=1` - all pass

### Task 3.2: Run build verification
- [x] `go build ./...` - pass

### Task 3.3: Run vet
- [x] `go vet ./...` - pass

## Phase 4: Documentation

### Task 4.1: Update tech-debt.md
- [x] Marked "Settings created without DB connection" as resolved with audit note

### Task 4.2: Update lessons-learned.md
- [x] Documented repository initialization audit pattern