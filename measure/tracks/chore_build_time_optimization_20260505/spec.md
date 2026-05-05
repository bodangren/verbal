# Specification: Build Time Optimization

## Overview

The project suffers from excessively long build and vet times (>2 minutes) due to CGo/GTK4 dependencies in the UI package. This chore targets reducing these times to under 30 seconds for incremental builds.

## Problem Statement

- `go vet ./...` takes >2 minutes
- `go build ./...` takes >2 minutes
- Even incremental builds with cached objects can take ~6s due to CGo recompilation
- The UI package is the primary bottleneck due to GTK4 bindings

## Proposed Solution

Investigate and implement one or more strategies:
1. **Split packages**: Move core business logic to separate packages without CGo dependencies
2. **Cache optimization**: Improve GOCACHE and use sccache for CGo caching
3. **Lazy loading**: Investigate if GTK4 package imports can be deferred
4. **Build tags**: Use build tags to conditionally compile UI components
5. **Parallel build flags**: Use `-p` flag to limit parallelism or tune Go build concurrency

## Functional Requirements

1. Incremental builds (no changes) should complete in <10 seconds
2. Incremental builds (small UI change) should complete in <30 seconds
3. Full clean build should complete in <120 seconds
4. `go vet` should complete in <30 seconds
5. All existing tests must still pass
6. No functional changes to the application

## Non-Functional Requirements

- Maintain 100% backward compatibility
- No changes to application runtime behavior
- Keep build process simple (no complex tooling)

## Out of Scope

- Changes to runtime behavior
- Changes to UI functionality
- Changes to test coverage requirements

## Acceptance Criteria

1. [ ] `time go build ./...` completes in <120 seconds on first build
2. [ ] Second `go build ./...` (no changes) completes in <10 seconds
3. [ ] `time go vet ./...` completes in <30 seconds
4. [ ] `time go test ./...` completes with all tests passing
5. [ ] Incremental UI change builds in <30 seconds