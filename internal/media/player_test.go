package media

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

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
	fp := newFakePlayer()

	wantErr := fmt.Errorf("simulated GStreamer init failure")
	fp.SetPlayError(wantErr)

	if err := fp.Play(); err == nil {
		t.Fatal("Play() with scripted error = nil, want error")
	} else if err != wantErr {
		t.Errorf("Play() error = %v, want %v", err, wantErr)
	}

	// After clearing the error, Play must succeed again.
	fp.SetPlayError(nil)
	if err := fp.Play(); err != nil {
		t.Errorf("Play() after clearing error = %v, want nil", err)
	}
}

func TestFakePlayer_SeekTo_DurationBoundary(t *testing.T) {
	fp := newFakePlayer()
	fp.SetDuration(10)

	if ok := fp.SeekTo(10); !ok {
		t.Fatal("SeekTo(duration) = false, want true")
	}
	if got := fp.QueryPosition(); got != 10 {
		t.Fatalf("QueryPosition after SeekTo(duration) = %v, want 10", got)
	}

	if ok := fp.SeekTo(10.000001); ok {
		t.Fatal("SeekTo beyond duration = true, want false")
	}
	if got := fp.QueryPosition(); got != 10 {
		t.Fatalf("QueryPosition after failed beyond-duration seek = %v, want unchanged 10", got)
	}
}

func TestFakePlayer_SeekTo_FailedNegativeSeekPreservesPosition(t *testing.T) {
	fp := newFakePlayer()

	if ok := fp.SeekTo(4); !ok {
		t.Fatal("SeekTo(4) = false, want true")
	}
	if ok := fp.SeekTo(-0.001); ok {
		t.Fatal("SeekTo(-0.001) = true, want false")
	}
	if got := fp.QueryPosition(); got != 4 {
		t.Fatalf("QueryPosition after failed negative seek = %v, want unchanged 4", got)
	}
}

func TestFakePlayer_ConcurrentAccess(t *testing.T) {
	fp := newFakePlayer()
	fp.SetDuration(100)

	var wg sync.WaitGroup
	for i := 0; i < 25; i++ {
		pos := float64(i)
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := fp.Play(); err != nil {
				t.Errorf("Play() = %v, want nil", err)
			}
			if ok := fp.SeekTo(pos); !ok {
				t.Errorf("SeekTo(%v) = false, want true", pos)
			}
			_ = fp.QueryPosition()
			_ = fp.QueryDuration()
			if err := fp.Pause(); err != nil {
				t.Errorf("Pause() = %v, want nil", err)
			}
		}()
	}
	wg.Wait()
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
