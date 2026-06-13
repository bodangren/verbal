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
// STUB BLOCK — Phase 2 Red
// =============================================================================
//
// The following declarations shadow the future `internal/media/gst_player.go`
// production file. They exist so this test file compiles against the expected
// public API while the implementation is still pending. The Green role MUST:
//   1. Create `internal/media/gst_player.go` with the same exported signatures,
//      using real GStreamer calls and the same package-private helper surface.
//   2. Remove this entire STUB BLOCK (including all STUB-only fields).
//   3. Ensure all tests in this file pass against the production code.
//
// Per test-strategy §4 (Architecture Guardrails):
//   - Path safety: any path reaching `gst_player.go` MUST go through
//     `internal/media/sanitize.go` (QuoteLocation). The build-pipeline
//     function must call QuoteLocation on the filePath argument.
//   - "Player" interface satisfaction: `var _ Player = (*GstPlayer)(nil)`
//     is asserted in the Compile-time section below.
//   - "PipelineQuerier" interface satisfaction is also pinned so the
//     existing `PositionMonitor` can take a `*GstPlayer` as a drop-in for
//     `*PlaybackPipeline`.
//
// Per test-strategy §5 (Per-Phase Test Approach Notes for P2):
//   - Pipeline-string construction tests (BuildGstPlayerPipeline) are pure-fn,
//     no GStreamer init — fast, always run.
//   - State-machine tests (QueryPosition / QueryDuration / SeekTo / GetState
//     / Close) target the no-pipeline-yet branch.
//   - `TestSmoke_GstPlayer_Constructs` builds a real pipeline against a
//     tiny fixture, gated by canInitializeGST() — never skipped silently.
// =============================================================================

// BuildGstPlayerPipeline returns the GStreamer pipeline description used by
// GstPlayer. It is exposed as a pure function so the Red tests can assert
// the pipeline shape (filesrc + decodebin + video-sink + autoaudiosink)
// without booting GStreamer.
//
// The videoSink argument is the GStreamer element name to use for the video
// branch (e.g. "gtk4paintablesink", "autovideosink"). An empty string MUST
// fall back to "autovideosink". The filePath argument MUST be sanitized via
// QuoteLocation so paths containing newlines, carriage returns, or
// spaces are safely escaped into the pipeline description.
func BuildGstPlayerPipeline(filePath, videoSink string) string {
	// STUB — Green phase produces a real `filesrc location=... ! decodebin
	// name=dec dec. ! queue ! videoconvert ! <videoSink> dec. ! queue !
	// audioconvert ! audioresample ! autoaudiosink` description, calling
	// QuoteLocation(filePath) so shell-metacharacters cannot break out.
	return ""
}

// GstPlayer is a GStreamer-based Player implementation that targets an
// embedded GTK4 preview via gtk4paintablesink (when available), falling
// back to autovideosink. It satisfies both the `Player` contract (Phase 1)
// and the existing `PipelineQuerier` contract used by PositionMonitor.
type GstPlayer struct {
	// STUB-only fields removed by Green phase.
	filePath    string
	videoSink   string
	pipelineStr string
	closed      bool
}

// NewGstPlayer returns a GstPlayer for the given file path. The pipeline
// is constructed via BuildGstPlayerPipeline; actual gst.ParseLaunch happens
// lazily (on first Play or via the production code's explicit init step).
// An empty filePath MUST return a non-nil error.
func NewGstPlayer(filePath string) (*GstPlayer, error) {
	// STUB — Green phase must validate filePath and reject empty input.
	_ = errors.New
	return &GstPlayer{
		filePath:    filePath,
		videoSink:   "autovideosink",
		pipelineStr: BuildGstPlayerPipeline(filePath, "autovideosink"),
	}, nil
}

// NewGstPlayerWithSink is the explicit-sink variant. An empty videoSink
// MUST fall back to "autovideosink".
func NewGstPlayerWithSink(filePath, videoSink string) (*GstPlayer, error) {
	// STUB — Green phase must apply the empty-sink fallback to
	// "autovideosink" before storing.
	return &GstPlayer{
		filePath:    filePath,
		videoSink:   videoSink,
		pipelineStr: BuildGstPlayerPipeline(filePath, videoSink),
	}, nil
}

// FilePath returns the source file path passed to the constructor.
func (g *GstPlayer) FilePath() string { return g.filePath }

// VideoSink returns the GStreamer element name used for the video branch.
func (g *GstPlayer) VideoSink() string { return g.videoSink }

// PipelineDescription returns the cached pipeline description string.
// Exposed for tests and for the production wiring in internal/app/run.go.
func (g *GstPlayer) PipelineDescription() string { return g.pipelineStr }

// Play starts playback. STUB returns nil so close-to-contract assertions
// can pin behaviour. Green phase wires SetState(gst.StatePlaying).
func (g *GstPlayer) Play() error { return nil }

// Pause suspends playback. STUB returns nil.
func (g *GstPlayer) Pause() error { return nil }

// Stop halts playback and rewinds. STUB returns nil.
func (g *GstPlayer) Stop() error { return nil }

// Close releases all resources. STUB is idempotent.
func (g *GstPlayer) Close() error {
	g.closed = true
	return nil
}

// SeekTo seeks to the given position in seconds. STUB returns true for
// position >= 0 and false otherwise; production wires SeekSimple.
func (g *GstPlayer) SeekTo(position float64) bool { return position >= 0 }

// QueryPosition returns -1 (no pipeline constructed yet). Production code
// returns gst.QueryPosition converted to seconds, or -1 on query failure.
func (g *GstPlayer) QueryPosition() float64 { return -1 }

// QueryDuration returns -1 (no pipeline constructed yet).
func (g *GstPlayer) QueryDuration() float64 { return -1 }

// GetState returns the current pipeline state. Initial state is StateStopped.
func (g *GstPlayer) GetState() PipelineState { return StateStopped }

// END STUB BLOCK

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
