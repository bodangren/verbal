# Plan: Feature - Transcription Integration

## Objective
Integrate the AI transcription provider into the main application, enabling users to transcribe recordings and view results in the UI.

## Architecture
```
internal/transcription/
├── service.go        # Coordinates recording → file → transcription
├── service_test.go   # Unit tests
```

UI integration in cmd/verbal/main.go:
- Add "Transcribe" button for completed recordings
- Display transcription results with word-level timestamps
- Show progress during transcription

## Phase 1: Transcription Service [x] Completed
- [x] Create TranscriptionService struct with provider selection
- [x] Add TranscribeFile(path string) method
- [x] Add progress callback support
- [x] Add error handling and retries
- [x] Unit tests with mock provider

## Phase 2: UI Integration [ ] Not Started
- [ ] Add transcribe button to main window
- [ ] Create transcription results display area
- [ ] Show progress indicator during transcription
- [ ] Handle errors gracefully in UI

## Phase 3: End-to-End Flow [ ] Not Started
- [ ] Wire recording → save → transcribe workflow
- [ ] Store transcription results with recording metadata
- [ ] Display word-level timestamps
- [ ] Integration tests

## Success Criteria
- User can record, then transcribe with one click
- Transcription results display with timestamps
- Progress shown during transcription
- Errors handled gracefully with user feedback
