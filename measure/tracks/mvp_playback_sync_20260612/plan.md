# Plan: MVP Playback & Sync

**Status:** PLANNED  
**Created:** 2026-06-12  
**Focus:** Implement embedded playback and transcript word highlighting.

---

## Phase 1: Player Interface

### Red
- [x] Write failing tests for `media.Player` interface: `Play`, `Pause`, `Stop`, `Seek`, `Position`, `Duration`. Red command + fail count recorded below. — `69036f0`

**Targeted Red command:**
```bash
go test ./internal/media -run 'TestFakePlayer|TestSmoke_PlaybackPipeline_SatisfiesPlayer' -count=1
```

**Red result (recorded 2026-06-14, Phase 1 Red commit):**
- 12 new tests added in `internal/media/player_test.go`
- 5 FAIL (RED signal — fakePlayer STUB does not implement contract): `TestFakePlayer_SeekTo_ValidPosition_ReturnsTrue`, `TestFakePlayer_SeekTo_UpdatesQueryPosition`, `TestFakePlayer_QueryDuration_ReturnsConfiguredDuration`, `TestFakePlayer_Stop_ResetsPositionToZero`, `TestFakePlayer_PlayPausePlay_PositionUnchangedAcrossToggles`
- 1 SKIP (`TestFakePlayer_Play_ErrorInjection`) — documents missing `SetPlayError` API that GREEN must add per test-strategy §1
- 6 PASS — pinning existing trivial behaviour (Play/Pause/Stop return nil, SeekTo(-1) returns false, QueryPosition defaults to -1, smoke test verifies `*PlaybackPipeline` satisfies the STUB Player interface)
- Pre-existing 85 media-package tests: all still PASS (no collateral damage from STUB block)
- `go vet ./internal/media` clean

> **Design note (Red phase):** The plan's literal method names (`Seek`, `Position`, `Duration`) conflict with the existing `PlaybackPipeline` shape (`SeekTo`, `QueryPosition`, `QueryDuration`). The test strategy (§0 / §1 "Shared Fixtures & Mocks") explicitly requires the `Player` interface to model `PlaybackPipeline`'s shape so Phase 2 is a thin adapter, AND requires the compile-time smoke assertion `var _ Player = (*PlaybackPipeline)(nil)` to live in the same test file as the fake. To satisfy both, the Phase 1 Red contract uses the existing method names (`SeekTo`, `QueryPosition`, `QueryDuration`); the GREEN role may add thin adapter wrappers under the plan's preferred aliases if UX prefers them, but the interface in `internal/media/player.go` MUST stay aligned with `PlaybackPipeline`'s shape for the smoke assertion to hold.

### Green
- [x] Define `internal/media/player.go`. — `e2c856b`
- [x] Implement `fakePlayer` for tests. — `e2c856b`
- [x] Make tests pass. — `e2c856b`

**Green result (recorded 2026-06-14, Phase 1 Green commit):**
- Created `internal/media/player.go` with `Player` interface (Play, Pause, Stop, SeekTo, QueryPosition, QueryDuration)
- Created `internal/media/player_fake.go` with fully scriptable `fakePlayer`: position/duration tracking, state machine, SetPlayError, SetDuration
- Removed STUB BLOCK from `player_test.go`; enabled `TestFakePlayer_Play_ErrorInjection`
- Targeted Red command: 12 PASS, 0 FAIL, 0 SKIP
- Full media package: all tests PASS (no collateral damage)
- `go vet ./internal/media` clean

### Refactor
- [x] Commit: `feat(media): Add Player interface and fake` — `e2c856b`

---

## Phase 2: GStreamer Player

### Red
- [ ] Write failing tests for GStreamer player pipeline construction and state queries.

### Green
- [ ] Implement `internal/media/gst_player.go` using `playbin3` or custom decodebin pipeline.
- [ ] Support embedded video sink (`gtk4paintablesink`) with fallback.
- [ ] Implement `Seek` with accurate flags.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(media): Add GStreamer player implementation`

---

## Phase 3: Transcript View Widget

### Red
- [ ] Write failing tests for `ui.TranscriptView`: renders words, emits click events.

### Green
- [ ] Implement `internal/ui/transcript_view.go`.
- [ ] Use GTK labels or buttons for words.
- [ ] Emit `OnWordClicked(wordIndex)` callback.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ui): Add transcript view widget`

---

## Phase 4: Sync Controller

### Red
- [ ] Write failing tests for `sync.Controller`: given player position, returns correct word index via binary search.

### Green
- [ ] Implement `internal/sync/controller.go`.
- [ ] Poll player position at 10Hz.
- [ ] Binary search word timestamps.
- [ ] Dispatch highlight updates via `glib.IdleAdd`.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(sync): Add transcript sync controller`

---

## Phase 5: Playback Screen

### Red
- [ ] Write failing tests for `ui.PlaybackScreen`: wires player, transcript view, and sync controller.

### Green
- [ ] Implement `internal/ui/playback_screen.go`.
- [ ] Add transport controls (play/pause, seek buttons).
- [ ] Bind keyboard shortcuts (Space, arrows).
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ui): Add playback screen`

---

## Phase 6: Final Verification

- [ ] Run `make check`.
- [ ] Manual verification: open a transcribed recording, click words to seek, verify highlight follows playback.
- [ ] Update `measure/tech-debt.md` and `measure/lessons-learned.md` if needed.
- [ ] Update this `plan.md` and `measure/tracks.md`.
- [ ] Commit: `measure(plan): Mark MVP playback & sync complete`
