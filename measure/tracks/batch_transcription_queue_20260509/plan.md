# Plan: Batch Transcription Queue

## Phase 1: Queue Data Model (TDD)
- [ ] Write tests for BatchQueueRepository
- [ ] Add batch_queue table (id, filePath, status, progress, createdAt, startedAt, completedAt)
- [ ] Implement enqueue, dequeue, updateStatus, cancel methods
- [ ] Tests pass

## Phase 2: Queue Processing Engine
- [ ] Write tests for BatchTranscriptionService
- [ ] Implement sequential processing with progress callbacks
- [ ] Wire existing TranscriptionService into batch runner
- [ ] Tests pass

## Phase 3: UI Integration
- [ ] Add "Batch Transcribe" menu item and dialog
- [ ] Add queue sidebar panel with progress bars
- [ ] Add cancel/pause controls
- [ ] Manual verification

## Phase 4: Verification
- [ ] Full test suite pass
- [ ] Build and vet clean
- [ ] Update lessons-learned.md
- [ ] Commit and push
