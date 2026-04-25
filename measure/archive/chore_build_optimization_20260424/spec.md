# Specification: Chore - Build Optimization

## Overview
Implement incremental build caching to speed up repeated builds of the Go + GTK4 project. The full rebuild takes >2 minutes due to CGo/GTK dependencies.

## Problem Statement
The tech-debt registry notes: "`go vet` and `go build` timeout on full project" - The UI package takes >2 minutes to vet/build due to CGo/GTK dependencies.

## Functional Requirements
1. Configure Go build cache to persist between invocations
2. Add a Makefile with incremental build targets
3. Add a `make check` target that runs vet, build, and tests in optimal order
4. Document build caching setup in README

## Non-Functional Requirements
- Build times should be <30s for incremental changes after first build
- Cache should be shared across terminal sessions

## Acceptance Criteria
1. `go build ./...` completes in <30s when no source files have changed
2. `make check` runs vet, build, and tests in sequence
3. Cache location is documented
4. First build may be slow, but subsequent builds are fast