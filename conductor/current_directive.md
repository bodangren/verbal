# Current Directive: AI Provider Abstraction Layer

## Active Directive
**Build a provider-agnostic AI interface that supports OpenAI and Google ecosystems, enabling credential management and unified command routing.**

## Scope
- **Provider Trait**: Define a Rust trait for AI operations (transcription, text generation, embeddings).
- **OpenAI Implementation**: Implement the trait for OpenAI API (Whisper, GPT-4).
- **Google Implementation**: Implement the trait for Google AI (Gemini).
- **Credential Management**: Secure storage and retrieval of API keys via Tauri's secure storage.
- **IPC Commands**: Frontend commands to configure providers and make AI requests.

## Success Criteria
- A user can configure API keys for OpenAI and/or Google.
- The app can make transcription requests through the abstraction layer.
- Provider switching works without code changes in frontend.
- All AI operations are routed through the abstraction module.

## Timeline
Started: 2026-03-23
Target Completion: 2026-03-30
