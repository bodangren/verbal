package media

import (
	"testing"

	"verbal/internal/db"
)

// Red-phase contract tests for the Export Presets and Profiles track,
// Phase 2: Export Dialog Integration (2b — codec→preset→pipeline pure
// function).
//
// See measure/tracks/export_presets_and_profiles_20260509/test-strategy.md
// §5 (Phase 2 "stream-copy decision is a pure function under unit test
// using fakeCodecDetector") and §7 (targeted Red command:
//
//	go test ./internal/media/ -run TestPresetToPipelineConfig -count=1 -v
//
// ).
//
// The Green-phase implementation must add, in `internal/media`, at
// minimum:
//
//   - type PipelineConfig struct {
//         VideoCodec  string
//         AudioCodec  string
//         Container   string
//         Bitrate     int64
//         Width       int
//         Height      int
//         StreamCopy  bool
//         AudioOnly   bool
//         Muxer       string  // mp4mux / matroskamux / webmmux / wavenc
//         VEncoder    string  // "copy" when StreamCopy, else vp9enc / x264enc / etc.
//         AEncoder    string  // "copy" when StreamCopy, else aac / opus / flac encoder
//     }
//   - type PresetCodecDetector interface {
//         Detect(filePath string) (CodecInfo, error)
//     }
//     (the existing media.CodecDetector interface must satisfy this —
//     compile-time proof below)
//   - func PresetToPipelineConfig(p *db.Preset, sourceCodec CodecInfo) PipelineConfig
//
// The pure function decides stream-copy from BOTH:
//   1. CodecInfo.CanStreamCopy() — true for H.264/H.265/VP8/VP9 source
//      (internal/media/codec.go:52 — defence in depth: never stream-copy
//      AV1 or Unknown sources even if the preset's declared codec
//      matches).
//   2. Preset's declared VideoCodec matches the source's VideoCodec.
//      If either condition fails, force re-encode (test-strategy §3
//      "stream-copy gating" + spec.md AC #5: "Stream-copy used when
//      source matches preset codec").
//
// Audio-only path: when the preset has empty VideoCodec (e.g. Podcast
// Audio), the pipeline must NOT include a video encoder; VEncoder="" and
// AudioOnly=true (test-strategy §3 stream-copy gating + Built-in preset
// "Podcast Audio" at internal/db/preset_repository.go:308 has
// VideoCodec="").
//
// Container→muxer mapping (test-strategy §2 Built-in preset coverage
// requires mp4/mkv/webm/wav/m4a — all 5 must be supported):
//   - mp4  -> mp4mux
//   - mkv  -> matroskamux
//   - webm -> webmmux
//   - wav  -> wavenc (audio-only container, muxer IS the encoder)
//   - m4a  -> mp4mux
//
// All tests below reference symbols that do not exist yet, so the
// package will fail to compile when the targeted Red command runs. That
// is the expected Red outcome. The Green-phase author must make these
// tests pass without removing or weakening any of the contracts above.

// TestPresetCodecDetector_InterfaceCompatibility is the compile-time
// proof that the existing media.CodecDetector interface satisfies the
// new PresetCodecDetector interface — the Green author reuses the
// existing interface (or extends it; either way the test depends only
// on the interface, not the GStreamer implementation). This is the
// "fake cannot drift from production" guarantee (test-strategy §7).
func TestPresetCodecDetector_InterfaceCompatibility(t *testing.T) {
	var _ PresetCodecDetector = (CodecDetector)(nil)
}

// TestPresetToPipelineConfig_H264Preset_H264Source_StreamCopy verifies
// the headline AC #5 case: H.264 source + H.264 preset (YouTube 1080p)
// must take the stream-copy path. The pipeline must set
// StreamCopy=true, VEncoder="copy", AEncoder="copy", and the YouTube
// 1080p preset's dimensions/bitrate must be propagated.
func TestPresetToPipelineConfig_H264Preset_H264Source_StreamCopy(t *testing.T) {
	preset := builtinPreset(t, "YouTube 1080p")
	source := CodecInfo{Video: VideoCodecH264, Audio: AudioCodecAAC, Container: ContainerMP4}

	cfg := PresetToPipelineConfig(preset, source)

	if !cfg.StreamCopy {
		t.Errorf("cfg.StreamCopy = false, want true (H.264 source + H.264 preset)")
	}
	if cfg.VEncoder != "copy" {
		t.Errorf("cfg.VEncoder = %q, want %q", cfg.VEncoder, "copy")
	}
	if cfg.AEncoder != "copy" {
		t.Errorf("cfg.AEncoder = %q, want %q", cfg.AEncoder, "copy")
	}
	if cfg.AudioOnly {
		t.Error("cfg.AudioOnly = true, want false (YouTube 1080p has VideoCodec=\"h264\")")
	}
	if cfg.Muxer != "mp4mux" {
		t.Errorf("cfg.Muxer = %q, want %q (mp4 container)", cfg.Muxer, "mp4mux")
	}
	if cfg.VideoCodec != "h264" {
		t.Errorf("cfg.VideoCodec = %q, want %q", cfg.VideoCodec, "h264")
	}
	if cfg.AudioCodec != "aac" {
		t.Errorf("cfg.AudioCodec = %q, want %q", cfg.AudioCodec, "aac")
	}
	if cfg.Width != 1920 || cfg.Height != 1080 {
		t.Errorf("cfg dimensions = %dx%d, want 1920x1080 (YouTube 1080p)", cfg.Width, cfg.Height)
	}
	if cfg.Bitrate != 8_000_000 {
		t.Errorf("cfg.Bitrate = %d, want 8_000_000", cfg.Bitrate)
	}
}

// TestPresetToPipelineConfig_VP9Preset_VP9Source_StreamCopy verifies
// stream-copy for a VP9 source matched against the Web Preview preset
// (VP9/Opus/WebM). Muxer must be webmmux, audio is "copy".
func TestPresetToPipelineConfig_VP9Preset_VP9Source_StreamCopy(t *testing.T) {
	preset := builtinPreset(t, "Web Preview")
	source := CodecInfo{Video: VideoCodecVP9, Audio: AudioCodecOpus, Container: ContainerWebM}

	cfg := PresetToPipelineConfig(preset, source)

	if !cfg.StreamCopy {
		t.Errorf("cfg.StreamCopy = false, want true (VP9 source + VP9 preset)")
	}
	if cfg.VEncoder != "copy" {
		t.Errorf("cfg.VEncoder = %q, want %q", cfg.VEncoder, "copy")
	}
	if cfg.AEncoder != "copy" {
		t.Errorf("cfg.AEncoder = %q, want %q", cfg.AEncoder, "copy")
	}
	if cfg.Muxer != "webmmux" {
		t.Errorf("cfg.Muxer = %q, want %q (webm container)", cfg.Muxer, "webmmux")
	}
}

// TestPresetToPipelineConfig_MismatchedCodecs_ForcesReencode verifies
// the negative path: even when CodecInfo.CanStreamCopy() returns true
// for the SOURCE, a mismatched PRESET codec forces re-encode. An H.264
// source + Web Preview (VP9) preset must re-encode to VP9.
func TestPresetToPipelineConfig_MismatchedCodecs_ForcesReencode(t *testing.T) {
	preset := builtinPreset(t, "Web Preview")
	source := CodecInfo{Video: VideoCodecH264, Audio: AudioCodecAAC, Container: ContainerMP4}

	cfg := PresetToPipelineConfig(preset, source)

	if cfg.StreamCopy {
		t.Error("cfg.StreamCopy = true, want false (H.264 source + VP9 preset mismatched)")
	}
	if cfg.VEncoder == "copy" {
		t.Error("cfg.VEncoder = \"copy\", want a real encoder (vp9enc) — re-encode required")
	}
	if cfg.AEncoder == "copy" {
		t.Error("cfg.AEncoder = \"copy\", want a real encoder (opusenc) — re-encode required")
	}
}

// TestPresetToPipelineConfig_AV1Source_NeverStreamCopy is the defence-
// in-depth case (test-strategy §3 stream-copy gating): CodecInfo.
// CanStreamCopy() returns false for AV1 sources
// (internal/media/codec.go:53-54), so AV1 sources must NEVER stream-
// copy even when the preset declares a "compatible" codec. The pipeline
// must force re-encode.
func TestPresetToPipelineConfig_AV1Source_NeverStreamCopy(t *testing.T) {
	preset := builtinPreset(t, "YouTube 1080p")
	source := CodecInfo{Video: VideoCodecAV1, Audio: AudioCodecAAC, Container: ContainerMP4}

	cfg := PresetToPipelineConfig(preset, source)

	if cfg.StreamCopy {
		t.Error("cfg.StreamCopy = true, want false (AV1 source — CodecInfo.CanStreamCopy() is false)")
	}
}

// TestPresetToPipelineConfig_PodcastAudioPreset_AudioOnly verifies the
// audio-only path: Podcast Audio has VideoCodec="" (see
// internal/db/preset_repository.go:308), so the pipeline must NOT
// include a video encoder and must mark AudioOnly=true. The muxer for
// an m4a container is mp4mux (test-strategy §2).
func TestPresetToPipelineConfig_PodcastAudioPreset_AudioOnly(t *testing.T) {
	preset := builtinPreset(t, "Podcast Audio")
	source := CodecInfo{Video: VideoCodecH264, Audio: AudioCodecAAC, Container: ContainerMP4}

	cfg := PresetToPipelineConfig(preset, source)

	if !cfg.AudioOnly {
		t.Error("cfg.AudioOnly = false, want true (Podcast Audio has VideoCodec=\"\")")
	}
	if cfg.VEncoder != "" {
		t.Errorf("cfg.VEncoder = %q, want \"\" (audio-only path)", cfg.VEncoder)
	}
	if cfg.Muxer != "mp4mux" {
		t.Errorf("cfg.Muxer = %q, want %q (m4a container)", cfg.Muxer, "mp4mux")
	}
}

// TestPresetToPipelineConfig_DimensionsFromPreset verifies the preset's
// declared width/height are propagated to PipelineConfig (spec AC: the
// preset stores resolution, and the pipeline config derives from the
// preset).
func TestPresetToPipelineConfig_DimensionsFromPreset(t *testing.T) {
	preset := builtinPreset(t, "Web Preview")
	source := CodecInfo{Video: VideoCodecVP9, Audio: AudioCodecOpus, Container: ContainerWebM}

	cfg := PresetToPipelineConfig(preset, source)

	if cfg.Width != 1280 || cfg.Height != 720 {
		t.Errorf("cfg dimensions = %dx%d, want 1280x720 (Web Preview preset)", cfg.Width, cfg.Height)
	}
}

// TestPresetToPipelineConfig_BitrateFromPreset verifies the preset's
// declared bitrate is propagated (spec AC: the preset stores bitrate,
// and the pipeline config derives from the preset).
func TestPresetToPipelineConfig_BitrateFromPreset(t *testing.T) {
	preset := builtinPreset(t, "Archive")
	source := CodecInfo{Video: VideoCodecH264, Audio: AudioCodecFLAC, Container: ContainerMKV}

	cfg := PresetToPipelineConfig(preset, source)

	if cfg.Bitrate != 20_000_000 {
		t.Errorf("cfg.Bitrate = %d, want 20_000_000 (Archive preset)", cfg.Bitrate)
	}
}

// TestPresetToPipelineConfig_ContainerDeterminesMuxer is a table-driven
// contract covering all 5 containers from db.PresetContainer*. This is
// the spec AC + test-strategy §2 coverage requirement.
func TestPresetToPipelineConfig_ContainerDeterminesMuxer(t *testing.T) {
	cases := []struct {
		container string
		wantMuxer string
	}{
		{db.PresetContainerMP4, "mp4mux"},
		{db.PresetContainerMKV, "matroskamux"},
		{db.PresetContainerWebM, "webmmux"},
		{db.PresetContainerWAV, "wavenc"},
		{db.PresetContainerM4A, "mp4mux"},
	}
	for _, tc := range cases {
		t.Run(tc.container, func(t *testing.T) {
			preset := &db.Preset{
				Name: "x-" + tc.container,
				Container:  tc.container,
				VideoCodec: "h264",
				AudioCodec: "aac",
				Bitrate:    1_000_000,
				Width:      640,
				Height:     360,
			}
			source := CodecInfo{Video: VideoCodecH264, Audio: AudioCodecAAC, Container: ContainerMP4}

			cfg := PresetToPipelineConfig(preset, source)

			if cfg.Muxer != tc.wantMuxer {
				t.Errorf("container=%q: cfg.Muxer = %q, want %q", tc.container, cfg.Muxer, tc.wantMuxer)
			}
			if cfg.Container != tc.container {
				t.Errorf("container=%q: cfg.Container = %q, want %q", tc.container, cfg.Container, tc.container)
			}
		})
	}
}

// TestPresetToPipelineConfig_ArchivePreset_Lossless verifies the lossless
// archival path: Archive preset (H.264 + FLAC + MKV) + H.264 source must
// stream-copy both video and audio (FLAC support is widespread and the
// preset explicitly declares it).
func TestPresetToPipelineConfig_ArchivePreset_Lossless(t *testing.T) {
	preset := builtinPreset(t, "Archive")
	source := CodecInfo{Video: VideoCodecH264, Audio: AudioCodecFLAC, Container: ContainerMKV}

	cfg := PresetToPipelineConfig(preset, source)

	if !cfg.StreamCopy {
		t.Error("cfg.StreamCopy = false, want true (Archive preset + matching H.264/FLAC source)")
	}
	if cfg.VEncoder != "copy" {
		t.Errorf("cfg.VEncoder = %q, want %q", cfg.VEncoder, "copy")
	}
	if cfg.AEncoder != "copy" {
		t.Errorf("cfg.AEncoder = %q, want %q", cfg.AEncoder, "copy")
	}
	if cfg.Muxer != "matroskamux" {
		t.Errorf("cfg.Muxer = %q, want %q (mkv container)", cfg.Muxer, "matroskamux")
	}
}

// builtinPreset returns a *db.Preset mirroring one of the built-in
// presets from internal/db/preset_repository.go's BuiltinPresetsForTest.
// We do NOT import the live function so this test file is independent
// of any db-package symbol renaming risk and so the test fixtures match
// the spec's acceptance criteria explicitly.
func builtinPreset(t *testing.T, name string) *db.Preset {
	t.Helper()
	switch name {
	case "YouTube 1080p":
		return &db.Preset{
			Name:        "YouTube 1080p",
			Container:   db.PresetContainerMP4,
			VideoCodec:  "h264",
			AudioCodec:  "aac",
			Bitrate:     8_000_000,
			Width:       1920,
			Height:      1080,
			IsBuiltin:   true,
			Description: "Optimized for YouTube upload at 1080p",
		}
	case "Podcast Audio":
		return &db.Preset{
			Name:        "Podcast Audio",
			Container:   db.PresetContainerM4A,
			VideoCodec:  "",
			AudioCodec:  "aac",
			Bitrate:     128_000,
			Width:       1920,
			Height:      1080,
			IsBuiltin:   true,
			Description: "Audio-only preset for podcast export",
		}
	case "Archive":
		return &db.Preset{
			Name:        "Archive",
			Container:   db.PresetContainerMKV,
			VideoCodec:  "h264",
			AudioCodec:  "flac",
			Bitrate:     20_000_000,
			Width:       1920,
			Height:      1080,
			IsBuiltin:   true,
			Description: "Lossless archival quality",
		}
	case "Web Preview":
		return &db.Preset{
			Name:        "Web Preview",
			Container:   db.PresetContainerWebM,
			VideoCodec:  "vp9",
			AudioCodec:  "opus",
			Bitrate:     2_000_000,
			Width:       1280,
			Height:      720,
			IsBuiltin:   true,
			Description: "Lightweight web-optimized preview",
		}
	}
	t.Errorf("builtinPreset(%q): unknown built-in name", name)
	return nil
}