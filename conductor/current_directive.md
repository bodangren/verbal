# Current Directive: AI Provider Abstraction Layer

## Active Directive
**Implement provider-agnostic AI abstraction layer for transcription services.**

## Scope
- **Interface Design**: Define TranscriptionProvider interface with word-level timestamp support
- **OpenAI Integration**: Implement Whisper API client
- **Google Integration**: Implement Speech-to-Text API client
- **Configuration**: Environment-based API key/credential management
- **Error Handling**: Typed errors for rate limits, auth failures, etc.

## Success Criteria
- No direct SDK imports outside internal/ai module
- Consistent TranscriptionResult across providers
- All tests pass with mock HTTP servers
- API keys loaded from environment only

## Timeline
Started: 2026-03-26
Target Completion: 2026-03-27

## Next Steps
- Phase 1: Define interfaces and data structures
- Phase 2: Implement OpenAI Whisper provider
- Phase 3: Implement Google Speech-to-Text provider
- Phase 4: Factory pattern and configuration
