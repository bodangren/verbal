/conductor
Step 1: Load Context. Read `conductor/current_directive.md`, `conductor/tech-debt.md`, `conductor/lessons-learned.md`, `conductor/tracks.md`.
Step 2: Resume or Plan.
- If there is an `[~] In Progress` track, finish it. Do not create a new track.
- If no incomplete tracks, define exactly ONE new track serving `current_directive.md`. Create track artifacts.
- First track of any calendar day MUST be a `chore` type for refactor/cleanup of previous day's work.
Step 3: Implement the track autonomously with TDD (Red-Green-Refactor). Mark tasks complete as you go with commit SHAs.
Step 4: Verify. Run full test suite (`CI=true npm test`) and production build (`npm run tauri build`). Fix any new failures.
Step 5: Finalize.
- Update `tech-debt.md` and `lessons-learned.md` (keep ≤50 lines).
- Mark track done, move to `conductor/archive/`, update `conductor/tracks.md`.
- Commit and push with message: `chore(conductor): Archive <track_id> track; update docs`.
CRITICAL: All shell commands MUST use non-interactive flags (--yes, --no-interactive, etc.). Unattended run only.