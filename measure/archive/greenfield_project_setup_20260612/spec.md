# Specification: Greenfield Project Setup

## Overview

This track establishes the foundation for the Verbal greenfield rewrite. It replaces the previous monolithic architecture with a clean, testable structure before any user-facing features are implemented.

## Goals

1. Define the core domain model (`Recording`, `Transcript`, `Word`, `Segment`).
2. Set up a versioned SQLite migration system.
3. Create the `internal/app` controller as the single owner of dependency construction and lifecycle.
4. Keep `cmd/verbal/main.go` under 100 lines.
5. Establish package boundaries that prevent the UI from directly depending on AI providers or GStreamer internals.
6. Configure build, test, and CI commands.

## Non-Goals

- Implementing recording, playback, transcription, or editing.
- Designing UI widgets.
- Supporting local whisper.cpp or real-time transcription.

## Functional Requirements

### FR1: Domain Model
- Package `internal/domain` defines `Recording`, `Transcript`, `Word`, and `Segment`.
- `Word` has `Text`, `Start`, `End`, and optional `Confidence`.
- `Segment` is a time range derived from selected words for export.

### FR2: Database Schema
- SQLite database with a `schema_migrations` table.
- Migrations create `recordings` and `transcripts` tables.
- Migration runner is idempotent and ordered.

### FR3: Application Controller
- `internal/app.Controller` is constructed with a database path and optional config.
- Exposes `Initialize`, `Activate`, `Shutdown`, and `RunSmokeCheck`.
- Owns repository construction.

### FR4: Entry Point
- `cmd/verbal/main.go` parses flags, constructs the controller, and runs the GTK app.
- No business logic, service construction, or menu wiring in `main.go`.

### FR5: Build & CI
- `make check` runs `go vet ./...`, `go build ./...`, and `go test ./...`.
- `go run ./cmd/verbal --smoke-check` verifies the controller can initialize without a display.

## Acceptance Criteria

- [ ] `internal/domain` compiles and has unit tests for all types.
- [ ] `internal/db` has a working migration runner with tests.
- [ ] `internal/app.Controller` has tests for construction, initialization, and shutdown.
- [ ] `cmd/verbal/main.go` is under 100 lines.
- [ ] `make check` passes.
- [ ] `go run ./cmd/verbal --smoke-check` passes.
