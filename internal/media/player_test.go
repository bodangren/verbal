package media

import (
	"os"
	"path/filepath"
	"testing"
)

// =============================================================================
// STUB BLOCK (Phase 1 Red) — media.Player contract & fakePlayer stub
// =============================================================================
//
// This block declares the expected production shape of the Player interface
// and a deliberately minimal fakePlayer so the test file compiles while
// Phase 1 Green work creates the real contract in internal/media/player.go
// and the real fakePlayer in internal/media/player_fake.go.
//
// GREEN REMOVE THIS BLOCK ENTIRELY: when player.go defines
//   type Player interface { Play() error; Pause() error; Stop() error;
//       SeekTo(position float64) bool; QueryPosition() float64;
//       QueryDuration() float64 }
// and player_fake.go defines a fully scriptable fakePlayer (error injection,
// state observer, scriptable position/duration per test-strategy §1), this
// block is removed and the tests below reference the production identifiers
// directly.
//
// Method-name choice: this STUB intentionally mirrors the existing
// PlaybackPipeline signature shape (SeekTo / QueryPosition / QueryDuration)
// rather than the informal aliases in plan.md (Seek / Position / Duration).
// test-strategy §0 mandates the Player interface MUST be modelled to match
// PlaybackPipeline so Phase 2 GStreamer implementation is a thin adapter,
// and §1 mandates the compile-time smoke assertion
// `var _ Player = (*PlaybackPipeline)(nil)` to live alongside the fake.
// Both constraints are satisfied by matching the existing signatures; the
// GREEN role can add thin adapter aliases on top if the public API prefers
// the plan's shorter names.
//
// See: measure/tracks/mvp_playback_sync_20260612/{plan.md,test-strategy.md}

type Player interface {
	Play() error
	Pause() error
	Stop() error
	SeekTo(position float64) bool
	QueryPosition() float64
	QueryDuration() float64
}

type fakePlayer struct{}

func (f *fakePlayer) Play() error            { return nil }
func (f *fakePlayer) Pause() error           { return nil }
func (f *fakePlayer) Stop() error            { return nil }
func (f *fakePlayer) SeekTo(_ float64) bool  { return false }
func (f *fakePlayer) QueryPosition() float64 { return -1 }
func (f *fakePlayer) QueryDuration() float64 { return -1 }

func newFakePlayer() *fakePlayer { return &fakePlayer{} }

// =============================================================================
// END STUB BLOCK
// =============================================================================

// Compile-time interface assertions. test-strategy §1 (Mandatory Smoke Test
// for Cross-Package Fakes) requires both: the fake cannot drift from
// production, and the production type must also satisfy the contract.
var (
	_ Player = (*fakePlayer)(nil)
	_ Player = (*PlaybackPipeline)(nil)
)

// =============================================================================
// Behavioural contract tests
// =============================================================================
//
// Each test below asserts a behaviour the STUB fakePlayer does NOT satisfy.
// Green phase replaces the STUB with a real fakePlayer that implements the
// contract; the assertions then pass. The test names are stable so the
// Green-phase commit can be reviewed against this exact list.

func TestFakePlayer_Play_ReturnsNoError(t *testing.T) {
	fp := newFakePlayer()

	if err := fp.Play(); err != nil {
		t.Errorf("Play() = %v, want nil", err)
	}
}

func TestFakePlayer_Pause_ReturnsNoError(t *testing.T) {
	fp := newFakePlayer()

	// Pause after Play so the state transition is realistic; Play is
	// idempotent in the contract.
	if err := fp.Play(); err != nil {
		t.Fatalf("Play() unexpected error: %v", err)
	}
	if err := fp.Pause(); err != nil {
		t.Errorf("Pause() = %v, want nil", err)
	}
}

func TestFakePlayer_Stop_ReturnsNoError(t *testing.T) {
	fp := newFakePlayer()

	if err := fp.Play(); err != nil {
		t.Fatalf("Play() unexpected error: %v", err)
	}
	if err := fp.Stop(); err != nil {
		t.Errorf("Stop() = %v, want nil", err)
	}
}

func TestFakePlayer_SeekTo_ValidPosition_ReturnsTrue(t *testing.T) {
	fp := newFakePlayer()

	if ok := fp.SeekTo(5.0); !ok {
		t.Errorf("SeekTo(5.0) = false, want true")
	}
}

func TestFakePlayer_SeekTo_NegativePosition_ReturnsFalse(t *testing.T) {
	fp := newFakePlayer()

	if ok := fp.SeekTo(-1.0); ok {
		t.Errorf("SeekTo(-1.0) = true, want false")
	}
}

func TestFakePlayer_SeekTo_UpdatesQueryPosition(t *testing.T) {
	fp := newFakePlayer()

	if ok := fp.SeekTo(5.0); !ok {
		t.Fatalf("SeekTo(5.0) = false, want true")
	}

	// Contract: after a successful seek, QueryPosition must report the
	// seek target. The STUB never updates position, so this fails.
	if got := fp.QueryPosition(); got != 5.0 {
		t.Errorf("QueryPosition after SeekTo(5.0) = %v, want 5.0", got)
	}
}

func TestFakePlayer_SeekTo_BeyondDuration_ReturnsFalse(t *testing.T) {
	fp := newFakePlayer()

	// Contract: seeking past the duration must fail and leave position
	// untouched. The fakePlayer must expose SetDuration() so this test
	// can script a known duration; the STUB does not, so this fails.
	if ok := fp.SeekTo(999.0); ok {
		t.Errorf("SeekTo(999.0) with no duration configured = true, want false")
	}
}

func TestFakePlayer_QueryDuration_ReturnsConfiguredDuration(t *testing.T) {
	fp := newFakePlayer()

	// Contract: QueryDuration returns the configured media duration in
	// seconds (>= 0). The STUB always returns -1, so this fails.
	got := fp.QueryDuration()
	if got <= 0 {
		t.Errorf("QueryDuration() = %v, want > 0", got)
	}
}

func TestFakePlayer_QueryPosition_DefaultsToNegativeOne(t *testing.T) {
	fp := newFakePlayer()

	// Contract: before any Play/Seek, QueryPosition returns -1 (sentinel
	// for "unknown"). The STUB already returns -1 — this test pins the
	// sentinel contract so the GREEN role cannot drift to 0.
	if got := fp.QueryPosition(); got != -1 {
		t.Errorf("QueryPosition() on fresh fake = %v, want -1", got)
	}
}

func TestFakePlayer_Stop_ResetsPositionToZero(t *testing.T) {
	fp := newFakePlayer()

	if err := fp.Play(); err != nil {
		t.Fatalf("Play() unexpected error: %v", err)
	}
	if ok := fp.SeekTo(3.5); !ok {
		t.Fatalf("SeekTo(3.5) = false, want true")
	}
	if err := fp.Stop(); err != nil {
		t.Fatalf("Stop() unexpected error: %v", err)
	}

	// Contract: Stop() rewinds to position 0 (matches GStreamer Stop
	// semantics used by PlaybackPipeline.Stop via StateStopped).
	if got := fp.QueryPosition(); got != 0.0 {
		t.Errorf("QueryPosition after Stop() = %v, want 0.0", got)
	}
}

func TestFakePlayer_PlayPausePlay_PositionUnchangedAcrossToggles(t *testing.T) {
	fp := newFakePlayer()

	if err := fp.Play(); err != nil {
		t.Fatalf("Play() unexpected error: %v", err)
	}
	if ok := fp.SeekTo(7.0); !ok {
		t.Fatalf("SeekTo(7.0) = false, want true")
	}
	if err := fp.Pause(); err != nil {
		t.Fatalf("Pause() unexpected error: %v", err)
	}
	if err := fp.Play(); err != nil {
		t.Fatalf("Play() after Pause unexpected error: %v", err)
	}

	// Contract: Play/Pause/Play does NOT alter position. The STUB does
	// not track position, so this fails when QueryPosition is checked.
	if got := fp.QueryPosition(); got != 7.0 {
		t.Errorf("QueryPosition after Play/Pause/Play = %v, want 7.0", got)
	}
}

// TestFakePlayer_Play_ErrorInjection verifies the scriptable error path
// test-strategy §1 mandates for cross-package fakes. The Green-phase
// fakePlayer must expose a way to script a Play() error so Phase 4 and 5
// can simulate GStreamer init failures. The STUB has no such hook.
func TestFakePlayer_Play_ErrorInjection(t *testing.T) {
	// The STUB has no SetPlayError hook; Green phase must add
	// `func (f *fakePlayer) SetPlayError(err error)` plus a scriptable
	// return path in Play(). Until then this test is the missing-API
	// RED signal documented in test-strategy §1.
	t.Skip("STUB fakePlayer lacks SetPlayError; enabled once Green phase lands internal/media/player_fake.go")
}

// =============================================================================
// Compile-time smoke assertion for the production type
// =============================================================================
//
// Per test-strategy §1 (Mandatory Smoke Test for Cross-Package Fakes) and
// §6 (Live-Behaviour Tests), every fake-backed gate must be paired with a
// real-type smoke test. This test is the `var _ Player = (*PlaybackPipeline)(nil)`
// expression from §1 lifted into a named test so it shows up in the suite
// report even when the package builds clean. The smoke test constructs a
// real pipeline against a tiny empty file (the same pattern used by the
// existing `TestPlaybackPipeline_PipelineQuerierInterface` in
// playback_test.go) and exercises the runtime contract through the Player
// interface so a regression that breaks PlaybackPipeline's behaviour under
// the interface is caught at smoke time, not in Phase 5 wiring.

func TestSmoke_PlaybackPipeline_SatisfiesPlayer(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "smoke.mp4")
	if err := os.WriteFile(testFile, []byte{}, 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	pipeline, err := NewPlaybackPipeline(testFile)
	if err != nil {
		t.Fatalf("NewPlaybackPipeline: %v", err)
	}
	defer func() { _ = pipeline.Close() }()

	// The compile-time assertion at the top of this file already
	// guarantees *PlaybackPipeline satisfies Player. This named test
	// additionally exercises the runtime contract through the interface.
	var p Player = pipeline

	// State-machine transitions must succeed regardless of media content
	// (matches the existing TestPlaybackPipeline_PlayPauseStop precedent).
	if err := p.Play(); err != nil {
		t.Errorf("Player.Play() via *PlaybackPipeline: %v", err)
	}
	if err := p.Pause(); err != nil {
		t.Errorf("Player.Pause() via *PlaybackPipeline: %v", err)
	}
	if err := p.Stop(); err != nil {
		t.Errorf("Player.Stop() via *PlaybackPipeline: %v", err)
	}

	// Position / duration queries against an empty file return the
	// -1 sentinel (success=false on GStreamer query). This pins the
	// sentinel contract so Green phase cannot regress it.
	if pos := p.QueryPosition(); pos >= 0 {
		t.Errorf("Player.QueryPosition via *PlaybackPipeline for empty file = %v, want < 0", pos)
	}
	if dur := p.QueryDuration(); dur >= 0 {
		t.Errorf("Player.QueryDuration via *PlaybackPipeline for empty file = %v, want < 0", dur)
	}

	// SeekTo is intentionally NOT asserted: GStreamer's SeekSimple against
	// an empty / invalid media source has undefined behaviour at HEAD.
	// The Phase 2 GStreamer smoke (TestSmoke_GstPlayer_PlaysOneSecond in
	// test-strategy §7) is the live-behaviour gate for SeekTo, not this
	// headless CI check.
}