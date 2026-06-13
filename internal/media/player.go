package media

// Player defines the playback control contract for media playback.
// Implementations must support concurrent access from the GTK main loop
// and background sync goroutines.
//
// Method names mirror the existing PlaybackPipeline signature shape
// (SeekTo / QueryPosition / QueryDuration) so Phase 2's GStreamer
// implementation is a thin adapter without wrapper methods.
type Player interface {
	// Play starts or resumes playback.
	Play() error

	// Pause suspends playback, preserving the current position.
	Pause() error

	// Stop halts playback and rewinds to position 0.
	Stop() error

	// SeekTo moves the playback head to the given position in seconds.
	// Returns true on success, false for invalid positions (negative or
	// beyond the media duration).
	SeekTo(position float64) bool

	// QueryPosition returns the current playback position in seconds.
	// Returns -1 when the position is unknown (e.g. before first play,
	// or when the underlying engine cannot report it).
	QueryPosition() float64

	// QueryDuration returns the total media duration in seconds.
	// Returns -1 when the duration is unknown.
	QueryDuration() float64
}
