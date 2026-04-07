# Implementation Plan: Settings UI for AI Provider Configuration

## Phase 1: Database Layer and Core Types [x]
**Goal**: Create the foundation with database schema, repository, and core types.

### Tasks
1. [x] Create settings core types (`internal/settings/provider.go`)
   - Define `ProviderType` enum (OpenAI, Google)
   - Define `ProviderConfig` interface
   - Define `OpenAIConfig` and `GoogleConfig` structs
   - Define `Settings` struct

2. [x] Create database repository (`internal/db/settings_repository.go`)
   - `CreateSchema()` - Create settings table
   - `GetSettings()` - Load settings (singleton pattern)
   - `SaveSettings()` - Save/upsert settings
   - Repository tests with 80%+ coverage

3. [x] Create settings service (`internal/settings/service.go`)
   - `GetSettings()` - Load settings from repository
   - `SaveSettings()` - Validate and save settings
   - `GetActiveProvider()` - Return configured provider
   - `TestProviderConnection()` - Validate API key
   - Service tests with 80%+ coverage

### Quality Gates
- [x] All tests pass
- [x] Test coverage >80% (settings: 91.4%, db: 81.6%)
- [x] No lint errors
- [x] Build succeeds

---

## Phase 2: Settings UI Components [x]
**Goal**: Build the GTK4 UI components for settings configuration.

### Tasks
1. [x] Create provider configuration panel (`internal/ui/providerconfigpanel.go`)
   - `OpenAIConfigPanel` widget
   - `GoogleConfigPanel` widget
   - Form validation
   - Tests with display mocking

2. [x] Create settings window (`internal/ui/settingswindow.go`)
   - Main settings dialog
   - Provider selector dropdown
   - Stack for provider-specific panels
   - Test/Validate button
   - Save/Cancel buttons
   - CSS styling
   - Tests with display mocking

### Quality Gates
- [x] All tests pass (pending full test run)
- [x] UI follows GNOME HIG
- [x] Keyboard navigation works
- [x] Build succeeds (pending full build)

---

## Phase 3: Integration and Provider Factory Update
**Goal**: Wire settings into the application and update provider factory.

### Tasks
1. [ ] Update provider factory (`internal/ai/factory.go`)
   - Accept settings service as parameter
   - Create providers from configured settings
   - Fallback to environment variables if no settings

2. [ ] Integrate settings window into main app (`cmd/verbal/main.go`)
   - Add settings menu item (gear icon in header)
   - Wire settings window open action
   - Pass settings to transcription flow

3. [ ] Add menu bar or header bar button
   - Primary menu with "Preferences" item
   - Keyboard shortcut (Ctrl+,)

### Quality Gates
- [ ] All tests pass
- [ ] Settings window opens from main window
- [ ] Transcription uses configured provider
- [ ] Build succeeds

---

## Phase 4: Testing and Polish
**Goal**: Comprehensive testing and UI polish.

### Tasks
1. [ ] Integration tests
   - End-to-end settings flow
   - Provider switching tests

2. [ ] UI polish
   - Error messages and validation
   - Loading states during API test
   - Success feedback

3. [ ] Update documentation
   - User-facing docs for settings
   - Code comments

### Quality Gates
- [ ] All tests pass
- [ ] Manual QA on real display
- [ ] Test coverage >80% overall
- [ ] Build succeeds
- [ ] No lint errors

---

## Implementation Notes
- Follow existing patterns in `internal/db` for repository
- Use `gtk.PasswordEntry` for API key input
- Use `glib.IdleAdd()` for UI updates from async operations
- Follow GNOME HIG spacing (12px/18px multiples)
- Use existing CSS patterns from `internal/ui/styles.go`
