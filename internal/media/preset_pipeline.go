package media

import "verbal/internal/db"

// PipelineConfig holds the resolved pipeline parameters derived from a
// preset and the source file's detected codec info. It is the output
// of PresetToPipelineConfig and is consumed by the UI and export layers.
type PipelineConfig struct {
	VideoCodec string
	AudioCodec string
	Container  string
	Bitrate    int64
	Width      int
	Height     int
	StreamCopy bool
	AudioOnly  bool
	Muxer      string
	VEncoder   string
	AEncoder   string
}

// PresetCodecDetector is the interface the pipeline config resolver uses
// to detect source codec info. The existing media.CodecDetector
// interface satisfies this contract (compile-time assertion below).
type PresetCodecDetector interface {
	Detect(filePath string) (CodecInfo, error)
}

// Compile-time proof that CodecDetector satisfies PresetCodecDetector.
var _ PresetCodecDetector = (CodecDetector)(nil)

// PresetToPipelineConfig resolves a PipelineConfig from a preset and
// the source file's detected codec info. It decides stream-copy based
// on BOTH CodecInfo.CanStreamCopy() AND a match between the preset's
// declared VideoCodec and the source's VideoCodec. Audio stream-copy
// additionally requires the audio codecs to match.
//
// Audio-only presets (VideoCodec="") produce AudioOnly=true with no
// video encoder.
func PresetToPipelineConfig(p *db.Preset, sourceCodec CodecInfo) PipelineConfig {
	cfg := PipelineConfig{
		VideoCodec: p.VideoCodec,
		AudioCodec: p.AudioCodec,
		Container:  p.Container,
		Bitrate:    p.Bitrate,
		Width:      p.Width,
		Height:     p.Height,
		Muxer:      containerMuxer(p.Container),
	}

	if p.VideoCodec == "" {
		cfg.AudioOnly = true
		cfg.VEncoder = ""
		cfg.AEncoder = audioEncoderName(p.AudioCodec)
		return cfg
	}

	videoMatch := sourceCodec.Video == VideoCodec(p.VideoCodec)
	audioMatch := sourceCodec.Audio == AudioCodec(p.AudioCodec)
	canCopy := sourceCodec.CanStreamCopy()

	if canCopy && videoMatch && audioMatch {
		cfg.StreamCopy = true
		cfg.VEncoder = "copy"
		cfg.AEncoder = "copy"
	} else {
		cfg.StreamCopy = false
		if canCopy && videoMatch {
			cfg.VEncoder = "copy"
		} else {
			cfg.VEncoder = videoEncoderName(p.VideoCodec)
		}
		if audioMatch {
			cfg.AEncoder = "copy"
		} else {
			cfg.AEncoder = audioEncoderName(p.AudioCodec)
		}
	}

	return cfg
}

func containerMuxer(container string) string {
	switch container {
	case db.PresetContainerMP4:
		return "mp4mux"
	case db.PresetContainerMKV:
		return "matroskamux"
	case db.PresetContainerWebM:
		return "webmmux"
	case db.PresetContainerWAV:
		return "wavenc"
	case db.PresetContainerM4A:
		return "mp4mux"
	default:
		return "mp4mux"
	}
}

func videoEncoderName(codec string) string {
	switch codec {
	case "h264":
		return "x264enc"
	case "h265":
		return "x265enc"
	case "vp8":
		return "vp8enc"
	case "vp9":
		return "vp9enc"
	case "av1":
		return "av1enc"
	default:
		return "x264enc"
	}
}

func audioEncoderName(codec string) string {
	switch codec {
	case "aac":
		return "avenc_aac"
	case "mp3":
		return "lamemp3enc"
	case "opus":
		return "opusenc"
	case "vorbis":
		return "vorbisenc"
	case "flac":
		return "flacenc"
	default:
		return "avenc_aac"
	}
}
