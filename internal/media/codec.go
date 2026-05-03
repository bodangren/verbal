package media

import (
	"fmt"
	"strings"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

// VideoCodec represents the video codec type.
type VideoCodec string

const (
	VideoCodecH264    VideoCodec = "h264"
	VideoCodecH265    VideoCodec = "h265"
	VideoCodecVP8     VideoCodec = "vp8"
	VideoCodecVP9     VideoCodec = "vp9"
	VideoCodecAV1     VideoCodec = "av1"
	VideoCodecUnknown VideoCodec = "unknown"
)

// AudioCodec represents the audio codec type.
type AudioCodec string

const (
	AudioCodecAAC     AudioCodec = "aac"
	AudioCodecMP3     AudioCodec = "mp3"
	AudioCodecOpus    AudioCodec = "opus"
	AudioCodecVorbis  AudioCodec = "vorbis"
	AudioCodecUnknown AudioCodec = "unknown"
)

// ContainerFormat represents the media container format.
type ContainerFormat string

const (
	ContainerMKV     ContainerFormat = "mkv"
	ContainerMP4     ContainerFormat = "mp4"
	ContainerWebM    ContainerFormat = "webm"
	ContainerUnknown ContainerFormat = "unknown"
)

// CodecInfo holds codec parameters detected from a media file.
type CodecInfo struct {
	Video     VideoCodec
	Audio     AudioCodec
	Container ContainerFormat
}

// CanStreamCopy returns true if the codec parameters support stream-copy.
// Stream-copy works when source and output use the same codec family.
func (c CodecInfo) CanStreamCopy() bool {
	return c.Video == VideoCodecH264 || c.Video == VideoCodecH265 ||
		c.Video == VideoCodecVP8 || c.Video == VideoCodecVP9
}

// String returns a human-readable description of the codec info.
func (c CodecInfo) String() string {
	return fmt.Sprintf("CodecInfo{Video:%s, Audio:%s, Container:%s}",
		c.Video, c.Audio, c.Container)
}

// CodecDetector defines the interface for detecting codec parameters.
type CodecDetector interface {
	Detect(filePath string) (CodecInfo, error)
}

// GstCodecDetector uses GStreamer to probe media files for codec information.
type GstCodecDetector struct{}

// NewGstCodecDetector creates a new GStreamer-based codec detector.
func NewGstCodecDetector() *GstCodecDetector {
	return &GstCodecDetector{}
}

// Detect probes the media file to extract codec parameters.
func (d *GstCodecDetector) Detect(filePath string) (CodecInfo, error) {
	sanitized := QuoteLocation(filePath)
	pipelineStr := fmt.Sprintf("filesrc location=%s ! decodebin name=dec ! fakesink", sanitized)

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return CodecInfo{}, fmt.Errorf("failed to parse probe pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return CodecInfo{}, fmt.Errorf("element is not a pipeline")
	}

	bin, ok := element.(*gst.Bin)
	if !ok {
		return CodecInfo{}, fmt.Errorf("element is not a bin")
	}

	bus := pipeline.Bus()
	if bus == nil {
		return CodecInfo{}, fmt.Errorf("failed to get bus")
	}

	resultCh := make(chan CodecInfo, 1)
	errorCh := make(chan error, 1)

	decodebin := bin.ByName("dec")
	if decodebin == nil {
		return CodecInfo{}, fmt.Errorf("failed to find decodebin element")
	}

	decElement, ok := decodebin.(*gst.Element)
	if !ok {
		return CodecInfo{}, fmt.Errorf("decodebin is not an Element")
	}

	decElement.ConnectPadAdded(func(newPad *gst.Pad) {
		caps := newPad.CurrentCaps()
		if caps == nil {
			return
		}
		info := parseCodecFromCaps(caps)
		if info.Video != VideoCodecUnknown || info.Audio != AudioCodecUnknown {
			select {
			case resultCh <- info:
			default:
			}
		}
	})

	bus.AddSignalWatch()
	bus.Connect("message", func(bus *gst.Bus, msg *gst.Message) {
		switch msg.Type() {
		case gst.MessageError:
			err, _ := msg.ParseError()
			select {
			case errorCh <- err:
			default:
			}
		case gst.MessageEos:
			select {
			case <-resultCh:
			default:
				select {
				case errorCh <- fmt.Errorf("failed to detect codec: EOS received"):
				default:
				}
			}
		}
	})

	pipeline.SetState(gst.StatePaused)

	select {
	case info := <-resultCh:
		pipeline.SetState(gst.StateNull)
		return info, nil
	case err := <-errorCh:
		pipeline.SetState(gst.StateNull)
		return CodecInfo{}, err
	}
}

func parseCodecFromCaps(caps *gst.Caps) CodecInfo {
	info := CodecInfo{
		Video:     VideoCodecUnknown,
		Audio:    AudioCodecUnknown,
		Container: ContainerUnknown,
	}

	if caps == nil {
		return info
	}

	capsStr := caps.String()
	if strings.Contains(capsStr, "video/") {
		if strings.Contains(capsStr, "h264") || strings.Contains(capsStr, "avc") {
			info.Video = VideoCodecH264
		} else if strings.Contains(capsStr, "hevc") || strings.Contains(capsStr, "h265") {
			info.Video = VideoCodecH265
		} else if strings.Contains(capsStr, "vp8") {
			info.Video = VideoCodecVP8
		} else if strings.Contains(capsStr, "vp9") {
			info.Video = VideoCodecVP9
		} else if strings.Contains(capsStr, "av1") {
			info.Video = VideoCodecAV1
		} else {
			info.Video = VideoCodecUnknown
		}
	}

	if strings.Contains(capsStr, "audio/") {
		if strings.Contains(capsStr, "aac") {
			info.Audio = AudioCodecAAC
		} else if strings.Contains(capsStr, "mp3") || strings.Contains(capsStr, "mpeg") {
			info.Audio = AudioCodecMP3
		} else if strings.Contains(capsStr, "opus") {
			info.Audio = AudioCodecOpus
		} else if strings.Contains(capsStr, "vorbis") {
			info.Audio = AudioCodecVorbis
		} else {
			info.Audio = AudioCodecUnknown
		}
	}

	if strings.Contains(capsStr, "video/") {
		if strings.Contains(capsStr, "matroska") {
			info.Container = ContainerMKV
		} else if strings.Contains(capsStr, "mp4") || strings.Contains(capsStr, "quicktime") {
			info.Container = ContainerMP4
		} else if strings.Contains(capsStr, "webm") {
			info.Container = ContainerWebM
		}
	}

	return info
}

// DetectCodecInfo is a convenience function that uses GstCodecDetector.
func DetectCodecInfo(filePath string) (CodecInfo, error) {
	detector := NewGstCodecDetector()
	return detector.Detect(filePath)
}