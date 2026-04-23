# Chore - Repository Initialization Audit

## Status: IN_PROGRESS

## Summary

Audit the codebase for improper struct{} initialization patterns where repositories are created via `&RepoType{}` instead of factory methods that ensure proper DB connection wiring. This prevents nil pointer issues and ensures consistent initialization patterns.

## Background

The `SettingsRepository` was previously created via `&db.SettingsRepository{}` without a DB connection. This was fixed to use `database.SettingsRepo()`. However, other repositories may have the same issue.

## Scope

1. Audit all repository types (`RecordingRepository`, `SettingsRepository`, `ThumbnailRepository`, `TranscriptionRepository`, etc.)
2. Check all `&RepoType{}` patterns in the codebase
3. Verify each repository is initialized via its factory/constructor with proper dependencies
4. Document findings in tech-debt.md if any issues found

## Approach

- Use grep to find all `&[A-Z][a-zA-Z]*Repository{}` patterns
- Review each match to determine if proper initialization is used
- For any issues found, fix the initialization pattern
- Add tests to prevent regression if warranted

## Acceptance Criteria

- [ ] All repository instantiations use proper factory/constructor methods
- [ ] No `&RepoType{}` with nil dependencies exists in production code paths
- [ ] Tests pass
- [ ] Build succeeds