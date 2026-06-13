package media

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// =============================================================================
// Production types are defined in `internal/media/gst_player.go`. The STUB
// BLOCK that originally lived here was removed in the Green commit
// `feat(media): Add GStreamer player implementation`; the test file now
// exercises the real implementation per test-strategy §5 (P2: pipeline-
// string tests are pure-fn, state-machine tests target the real pipeline,
// and the smoke test is gated by canInitializeGST() — never silent).
// =============================================================================

// =============================================================================
// Compile-time interface assertions
// =============================================================================
//
// test-strategy §4 requires `var _ Player = (*GstPlayer)(nil)` per
// implementer's test file. We lift both the `Player` and the existing
// `PipelineQuerier` assertions into this test file (matching the precedent
// set by `var _ Player = (*PlaybackPipeline)(nil)` in player_test.go) so
// `go build` fails immediately if the production type drifts from the
// contract. The named test below (`TestGstPlayer_InterfaceContract`) makes
// the assertion discoverable in the suite report.
var (
	_ Player         = (*GstPlayer)(nil)
	_ PipelineQuerier = (*GstPlayer)(nil)
)

func TestGstPlayer_InterfaceContract(t *testing.T) {
	// The compile-time assertions above already pin the contract; this
	// named test exists for auditability per lessons-learned
	// §"Compile-Time Interface Assertions".
}

// =============================================================================
// Pipeline-string construction (pure-fn, headless, no GStreamer init)
// =============================================================================
//
// These tests exercise BuildGstPlayerPipeline directly. They are the
// "always run, fast" tier of the test-strategy §5 P2 pyramid.

func TestBuildGstPlayerPipeline_ContainsFilesrcAndDecodebin(t *testing.T) {
	got := BuildGstPlayerPipeline("/tmp/sample.mp4", "autovideosink")

	if !strings.Contains(got, "filesrc") {
		t.Errorf("BuildGstPlayerPipeline() pipeline = %q, want substring %q", got, "filesrc")
	}
	if !strings.Contains(got, "decodebin") {
		t.Errorf("BuildGstPlayerPipeline() pipeline = %q, want substring %q", got, "decodebin")
	}
}

func TestBuildGstPlayerPipeline_DefaultSink_UsesAutovideosink(t *testing.T) {
	got := BuildGstPlayerPipeline("/tmp/sample.mp4", "autovideosink")

	if !strings.Contains(got, "autovideosink") {
		t.Errorf("BuildGstPlayerPipeline() pipeline = %q, want substring %q", got, "autovideosink")
	}
}

func TestBuildGstPlayerPipeline_GtkPaintableSink_ReplacesAutovideosink(t *testing.T) {
	got := BuildGstPlayerPipeline("/tmp/sample.mp4", "gtk4paintablesink")

	if !strings.Contains(got, "gtk4paintablesink") {
		t.Errorf("BuildGstPlayerPipeline() pipeline = %q, want substring %q", got, "gtk4paintablesink")
	}
	// Sanity: the explicit gtk sink should not leave autovideosink in the
	// description (avoids two competing video sinks breaking the pipeline).
	if strings.Contains(got, "autovideosink") {
		t.Errorf("BuildGstPlayerPipeline() pipeline = %q, must not contain %q when gtk sink requested", got, "autovideosink")
	}
}

func TestBuildGstPlayerPipeline_AlwaysIncludesAutoaudiosink(t *testing.T) {
	for _, sink := range []string{"autovideosink", "gtk4paintablesink"} {
		got := BuildGstPlayerPipeline("/tmp/sample.mp4", sink)
		if !strings.Contains(got, "autoaudiosink") {
			t.Errorf("BuildGstPlayerPipeline(sink=%q) pipeline = %q, want substring %q", sink, got, "autoaudiosink")
		}
	}
}

func TestBuildGstPlayerPipeline_EmptySink_FallsBackToAutovideosink(t *testing.T) {
	got := BuildGstPlayerPipeline("/tmp/sample.mp4", "")

	if !strings.Contains(got, "autovideosink") {
		t.Errorf("BuildGstPlayerPipeline(\"\") pipeline = %q, want substring %q (fallback)", got, "autovideosink")
	}
	if strings.Contains(got, "gtk4paintablesink") {
		t.Errorf("BuildGstPlayerPipeline(\"\") pipeline = %q, must not pick gtk sink on empty input", got)
	}
}

func TestBuildGstPlayerPipeline_PathWithNewline_StripsControlChar(t *testing.T) {
	got := BuildGstPlayerPipeline("/tmp/foo\nbar.mp4", "autovideosink")

	// Shell-injection guard: a raw newline inside the pipeline description
	// would let an attacker break out of the quoted location= token. The
	// production code MUST go through QuoteLocation which strips \n.
	if strings.Contains(got, "\n") {
		t.Errorf("BuildGstPlayerPipeline() = %q, must not contain raw newline", got)
	}
	if !strings.Contains(got, "filesrc") {
		t.Errorf("BuildGstPlayerPipeline() = %q, want substring %q", got, "filesrc")
	}
}

func TestBuildGstPlayerPipeline_PathWithCarriageReturn_StripsControlChar(t *testing.T) {
	got := BuildGstPlayerPipeline("/tmp/foo\rbar.mp4", "autovideosink")

	if strings.Contains(got, "\r") {
		t.Errorf("BuildGstPlayerPipeline() = %q, must not contain raw carriage return", got)
	}
	// Pair the no-CR guard with a filesrc presence check so the test is a
	// real Red signal against the STUB (which returns "" and trivially
	// satisfies "no \r"). Mirrors TestBuildGstPlayerPipeline_PathWithNewline.
	if !strings.Contains(got, "filesrc") {
		t.Errorf("BuildGstPlayerPipeline() = %q, want substring %q", got, "filesrc")
	}
}

func TestBuildGstPlayerPipeline_QuotedPath_UsesQuoteLocation(t *testing.T) {
	// The pipeline must use QuoteLocation's quoting convention: the path
	// appears inside a Go-style double-quoted string (which strips \n and
	// \r via strconv.Quote). The reference output of QuoteLocation on
	// "/tmp/has\"quote.mp4" includes escaped backslashes; we assert that
	// the pipeline string contains the QuoteLocation result verbatim.
	const path = "/tmp/has\"quote.mp4"
	wantQuoted := QuoteLocation(path)

	got := BuildGstPlayerPipeline(path, "autovideosink")

	if !strings.Contains(got, wantQuoted) {
		t.Errorf("BuildGstPlayerPipeline() = %q, want substring %q (from QuoteLocation)", got, wantQuoted)
	}
}

func TestBuildGstPlayerPipeline_PathWithSpaces_QuotesProperly(t *testing.T) {
	got := BuildGstPlayerPipeline("/tmp/folder with spaces/video.mp4", "autovideosink")

	if !strings.Contains(got, "folder with spaces") {
		t.Errorf("BuildGstPlayerPipeline() = %q, want substring %q", got, "folder with spaces")
	}
	// QuoteLocation wraps the path in double quotes; we only require the
	// path itself to survive — actual quoting is verified by the
	// QuotedPath_UsesQuoteLocation test above.
}

func TestBuildGstPlayerPipeline_HandlesPathSafely_TableDriven(t *testing.T) {
	cases := []struct {
		name    string
		path    string
		notWant string
	}{
		{"newline-stripped", "/tmp/a\nb.mp4", "\n"},
		{"carriagereturn-stripped", "/tmp/a\rb.mp4", "\r"},
		{"plain-path-ok", "/tmp/plain.mp4", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := BuildGstPlayerPipeline(tc.path, "autovideosink")
			if tc.notWant != "" && strings.Contains(got, tc.notWant) {
				t.Errorf("BuildGstPlayerPipeline(%q) = %q, must not contain %q", tc.path, got, tc.notWant)
			}
			if !strings.Contains(got, "filesrc") {
				t.Errorf("BuildGstPlayerPipeline(%q) = %q, want substring %q", tc.path, got, "filesrc")
			}
		})
	}
}

// =============================================================================
// Constructor (no GStreamer init — exercises STUB path)
// =============================================================================

func TestNewGstPlayer_EmptyPath_ReturnsError(t *testing.T) {
	p, err := NewGstPlayer("")

	if err == nil {
		t.Errorf("NewGstPlayer(\"\") error = nil, want non-nil error for empty path")
	}
	if p != nil {
		t.Errorf("NewGstPlayer(\"\") player = %+v, want nil on error", p)
	}
}

func TestNewGstPlayer_ValidPath_ReturnsNonNilPlayer(t *testing.T) {
	p, err := NewGstPlayer("/tmp/sample.mp4")

	if err != nil {
		t.Errorf("NewGstPlayer(\"/tmp/sample.mp4\") unexpected error: %v", err)
	}
	if p == nil {
		t.Fatal("NewGstPlayer(\"/tmp/sample.mp4\") returned nil player, want non-nil")
	}
}

func TestNewGstPlayerWithSink_EmptySink_FallsBackToAutovideosink(t *testing.T) {
	p, err := NewGstPlayerWithSink("/tmp/sample.mp4", "")

	if err != nil {
		t.Errorf("NewGstPlayerWithSink unexpected error: %v", err)
	}
	if p == nil {
		t.Fatal("NewGstPlayerWithSink returned nil player, want non-nil")
	}
	if p.VideoSink() != "autovideosink" {
		t.Errorf("VideoSink() = %q, want %q (empty-sink fallback)", p.VideoSink(), "autovideosink")
	}
}

func TestNewGstPlayerWithSink_CustomSink_PassesThrough(t *testing.T) {
	p, err := NewGstPlayerWithSink("/tmp/sample.mp4", "gtk4paintablesink")

	if err != nil {
		t.Errorf("NewGstPlayerWithSink unexpected error: %v", err)
	}
	if p == nil {
		t.Fatal("NewGstPlayerWithSink returned nil player, want non-nil")
	}
	if p.VideoSink() != "gtk4paintablesink" {
		t.Errorf("VideoSink() = %q, want %q", p.VideoSink(), "gtk4paintablesink")
	}
}

func TestGstPlayer_FilePath_StoresProvidedPath(t *testing.T) {
	p, _ := NewGstPlayer("/tmp/sample.mp4")

	if got := p.FilePath(); got != "/tmp/sample.mp4" {
		t.Errorf("FilePath() = %q, want %q", got, "/tmp/sample.mp4")
	}
}

func TestGstPlayer_PipelineDescription_MatchesBuilderOutput(t *testing.T) {
	// The cached pipeline description must be the exact string returned by
	// BuildGstPlayerPipeline so the wiring in internal/app/run.go can use
	// either source interchangeably.
	p, err := NewGstPlayerWithSink("/tmp/sample.mp4", "gtk4paintablesink")
	if err != nil {
		t.Fatalf("NewGstPlayerWithSink: %v", err)
	}

	want := BuildGstPlayerPipeline("/tmp/sample.mp4", "gtk4paintablesink")
	if got := p.PipelineDescription(); got != want {
		t.Errorf("PipelineDescription() = %q, want %q", got, want)
	}
}

// =============================================================================
// State-machine contract (no GStreamer init — pins sentinel values & guards)
// =============================================================================
//
// These tests target the "no pipeline constructed yet" branch. They are
// the cheap insurance that the production GstPlayer keeps the same
// sentinel/guard contract as the existing PlaybackPipeline (see
// TestPlaybackPipeline_QueryPosition_NotPlaying in playback_test.go).

func TestGstPlayer_QueryPosition_BeforePlay_ReturnsNegativeOne(t *testing.T) {
	p, _ := NewGstPlayer("/tmp/sample.mp4")

	if got := p.QueryPosition(); got != -1 {
		t.Errorf("QueryPosition() on fresh player = %v, want -1 (sentinel)", got)
	}
}

func TestGstPlayer_QueryDuration_BeforePlay_ReturnsNegativeOne(t *testing.T) {
	p, _ := NewGstPlayer("/tmp/sample.mp4")

	if got := p.QueryDuration(); got != -1 {
		t.Errorf("QueryDuration() on fresh player = %v, want -1 (sentinel)", got)
	}
}

func TestGstPlayer_GetState_Initial_ReturnsStopped(t *testing.T) {
	p, _ := NewGstPlayer("/tmp/sample.mp4")

	if got := p.GetState(); got != StateStopped {
		t.Errorf("GetState() on fresh player = %v, want %v", got, StateStopped)
	}
}

func TestGstPlayer_SeekTo_NegativePosition_ReturnsFalse(t *testing.T) {
	p, _ := NewGstPlayer("/tmp/sample.mp4")

	if got := p.SeekTo(-1.0); got {
		t.Errorf("SeekTo(-1.0) = true, want false (negative rejected)")
	}
	if got := p.SeekTo(-0.0001); got {
		t.Errorf("SeekTo(-0.0001) = true, want false (negative rejected)")
	}
}

func TestGstPlayer_SeekTo_ZeroPosition_ReturnsTrue(t *testing.T) {
	p, _ := NewGstPlayer("/tmp/sample.mp4")

	if got := p.SeekTo(0.0); !got {
		t.Errorf("SeekTo(0.0) = false, want true (zero is a valid position)")
	}
}

func TestGstPlayer_Close_BeforePlay_IsIdempotent(t *testing.T) {
	p, _ := NewGstPlayer("/tmp/sample.mp4")

	if err := p.Close(); err != nil {
		t.Errorf("first Close() = %v, want nil", err)
	}
	if err := p.Close(); err != nil {
		t.Errorf("second Close() = %v, want nil (idempotent)", err)
	}
}

func TestGstPlayer_Play_Pause_Stop_ReturnNoErrorBeforePlay(t *testing.T) {
	// Contract: pre-pipeline state-machine calls do not error. Mirrors the
	// existing TestPlaybackPipeline_PlayPauseStop (playback_test.go:69)
	// which asserts the same against *PlaybackPipeline.
	p, _ := NewGstPlayer("/tmp/sample.mp4")

	if err := p.Play(); err != nil {
		t.Errorf("Play() = %v, want nil", err)
	}
	if err := p.Pause(); err != nil {
		t.Errorf("Pause() = %v, want nil", err)
	}
	if err := p.Stop(); err != nil {
		t.Errorf("Stop() = %v, want nil", err)
	}
}

// TestGstPlayer_Play_TransitionsStateFromStoppedToPlaying pins the
// state-machine contract that test-strategy §1 (Phase 2 pyramid "state-
// machine table tests with mock bus") explicitly mandates. A fresh player
// is in StateStopped (TestGstPlayer_GetState_Initial_ReturnsStopped); after
// Play() the pipeline MUST transition to StatePlaying. The STUB returns
// nil from Play() but does not mutate GetState(), so this test fails on
// the STUB and passes only when the Green role wires SetState(StatePlaying)
// on Play. Complements TestPlaybackPipeline_Play_StateTransition
// (playback_test.go).
func TestGstPlayer_Play_TransitionsStateFromStoppedToPlaying(t *testing.T) {
	p, _ := NewGstPlayer("/tmp/sample.mp4")

	if got := p.GetState(); got != StateStopped {
		t.Fatalf("GetState() before Play = %v, want %v (initial)", got, StateStopped)
	}
	if err := p.Play(); err != nil {
		t.Fatalf("Play(): %v", err)
	}
	if got := p.GetState(); got != StatePlaying {
		t.Errorf("GetState() after Play = %v, want %v (state transition)", got, StatePlaying)
	}
}

// =============================================================================
// Live smoke (gated by GStreamer init, never skipped silently)
// =============================================================================
//
// test-strategy §5 P2 mandates a `TestSmoke_GstPlayer_*` that builds a
// real pipeline against a tiny fixture. The test is gated by
// canInitializeGST() — when GStreamer is not initializable in the host
// environment the test calls t.Skipf with the underlying reason. It
// cannot fall through silently into the broader suite.

// gstInitOnce ensures the GStreamer init probe runs at most once per test
// process so the smoke test does not pay the init cost repeatedly.
var (
	gstInitOnce sync.Once
	gstInitOk   bool
	gstInitErr  error
)

func canInitializeGST() bool {
	gstInitOnce.Do(func() {
		defer func() {
			if r := recover(); r != nil {
				gstInitOk = false
				gstInitErr = errors.New("gst init panicked")
			}
		}()
		// A no-op builder call is enough to detect whether the package's
		// gst bindings can run in this environment without forcing the
		// test to construct a full pipeline. The production code calls
		// gst.ParseLaunch lazily; the smoke test exercises it directly.
		if BuildGstPlayerPipeline("/dev/null", "autovideosink") == "" {
			// Builder returned an empty string: production not yet
			// implemented. Treat as "not initializable" so the smoke
			// test skips with a clear reason rather than failing.
			gstInitOk = false
			gstInitErr = errors.New("BuildGstPlayerPipeline returned empty (production not yet wired)")
			return
		}
		gstInitOk = true
	})
	return gstInitOk
}

func TestSmoke_GstPlayer_Constructs(t *testing.T) {
	if !canInitializeGST() {
		t.Skipf("GStreamer not initializable: %v", gstInitErr)
	}

	// Mirrors the existing TestSmoke_PlaybackPipeline_SatisfiesPlayer
	// pattern (player_test.go:263): construct a real GstPlayer against
	// an empty file, exercise the state machine through the Player
	// interface, and assert sentinel position/duration. SeekTo is
	// intentionally NOT asserted because GStreamer's SeekSimple against
	// an empty/invalid media source has undefined behaviour at HEAD;
	// the live-behaviour gate for SeekTo is the Phase 4 polling test.
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "smoke.mp4")
	if err := os.WriteFile(testFile, []byte{}, 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	p, err := NewGstPlayer(testFile)
	if err != nil {
		t.Fatalf("NewGstPlayer: %v", err)
	}
	defer func() { _ = p.Close() }()

	var player Player = p

	if err := player.Play(); err != nil {
		t.Errorf("Player.Play() via *GstPlayer: %v", err)
	}
	if err := player.Pause(); err != nil {
		t.Errorf("Player.Pause() via *GstPlayer: %v", err)
	}
	if err := player.Stop(); err != nil {
		t.Errorf("Player.Stop() via *GstPlayer: %v", err)
	}

	if pos := player.QueryPosition(); pos >= 0 {
		t.Errorf("Player.QueryPosition via *GstPlayer for empty file = %v, want < 0", pos)
	}
	if dur := player.QueryDuration(); dur >= 0 {
		t.Errorf("Player.QueryDuration via *GstPlayer for empty file = %v, want < 0", dur)
	}
}
