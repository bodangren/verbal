# Current Directive: Repository Initialization Audit

## Status: IN_PROGRESS

**Track:** Chore - Repository Initialization Audit
**Started:** 2026-04-23
**Focus:** Audit codebase for improper struct{} initialization patterns instead of factory methods

---

## Summary

The tech-debt registry notes that `SettingsRepository` was previously created via `&db.SettingsRepository{}` without a DB connection. This was fixed to use `database.SettingsRepo()`. However, the pattern should be audited across all repositories.

## Resolution

- Audit all `&[A-Z][a-zA-Z]*Repository{}` patterns in the codebase
- Verify each repository is initialized via factory/constructor with proper dependencies
- Document findings and fix any issues

## Verification

- `go test ./... -count=1` - pass.
- `go build ./...` - pass.
- `go vet ./...` - pass.