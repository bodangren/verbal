# Specification: Transcription Max Retries Diagnostic Failure

## Problem

Manual QA can load and play an MP4, but transcription fails with `max retries exceeded`. That message does not provide enough information to determine whether the failure is caused by API credentials, network/DNS/TLS, provider rate limits, unsupported audio, file size, or service availability.

## Requirements

- Retry exhaustion must preserve and surface the underlying provider/network/API error.
- Non-retryable provider errors must still fail immediately with classified messages.
- Transcription UI and metadata must show actionable error text.
- The fix must preserve provider abstraction and avoid direct SDK coupling.

## Acceptance Criteria

- Tests verify retry exhaustion reports the final send/HTTP error in a useful way.
- The UI error should identify the active provider and the underlying cause.
- The saved `.json` transcription metadata should include the actionable error.
- Verification includes focused AI/transcription tests and full project tests/build/smoke.
