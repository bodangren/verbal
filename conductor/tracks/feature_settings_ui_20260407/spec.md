# Track: Settings UI for AI Provider Configuration

## Overview
Add a comprehensive settings/preferences UI that allows users to configure AI transcription providers (OpenAI Whisper, Google Speech-to-Text) through the GUI, eliminating the need for environment variables.

## Background
Currently, AI provider configuration requires setting environment variables (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, etc.). This is not user-friendly and makes it difficult to switch between providers or manage multiple API keys. A settings UI will improve the user experience significantly.

## Goals
1. Provide a GUI for configuring AI provider settings
2. Support multiple providers (OpenAI, Google) with provider-specific options
3. Persist settings to the database (secure storage for API keys)
4. Allow easy switching between providers
5. Validate settings (test API connectivity)
6. Follow GNOME HIG design principles

## Non-Goals
1. Encrypt API keys at rest (deferred to security hardening track)
2. Support for custom/local AI endpoints (deferred)
3. Cloud sync of settings (deferred)

## Acceptance Criteria
- [ ] Settings accessible via menu (hamburger menu or gear icon)
- [ ] Settings window/dialog with provider selection
- [ ] OpenAI provider configuration (API key, model selection)
- [ ] Google provider configuration (API key)
- [ ] Settings persist across app restarts
- [ ] Active provider is used for transcription
- [ ] UI follows GNOME HIG with proper spacing and colors
- [ ] Test coverage >80% for new code

## Technical Design

### Architecture
```
internal/
  settings/
    service.go      # Business logic for settings management
    provider.go     # Provider configuration types
  db/
    settings_repository.go  # Database operations for settings
  ui/
    settingswindow.go       # Main settings window/dialog
    providerconfigpanel.go  # Provider-specific config UI
```

### Database Schema
```sql
CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- Singleton pattern
    active_provider TEXT NOT NULL,
    openai_api_key TEXT,
    openai_model TEXT DEFAULT 'whisper-1',
    google_api_key TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### UI Design
- **Settings Window**: Modal dialog using `gtk.Dialog` or `gtk.Window`
- **Provider Selection**: `gtk.DropDown` for selecting active provider
- **Configuration Stack**: `gtk.Stack` to show provider-specific options
- **API Key Input**: `gtk.PasswordEntry` for secure input
- **Test Button**: Button to validate API connectivity
- **Save/Cancel**: Standard dialog buttons

### Integration Points
1. **AI Provider Factory**: Modify to read from settings service instead of env vars
2. **Main Window**: Add menu item or gear icon to open settings
3. **Transcription Flow**: Use configured provider for transcription

## Open Questions
1. Should API keys be masked in the UI after saving?
2. Should we support multiple API keys per provider?
3. Should settings be importable/exportable?
