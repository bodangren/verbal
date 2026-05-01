package media

import (
	"fmt"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

// VideoCodec represents the video codec type.
type VideoCodec string

const (
	VideoCodecH264  VideoCodec = "h264"
	VideoCodecH265  VideoCodec = "h265"
	VideoCodecVP8   VideoCodec = "vp8"
	VideoCodecVP9   VideoCodec = "vp9"
	VideoCodecAV1   VideoCodec = "av1"
	VideoCodecUnknown VideoCodec = "unknown"
)

// AudioCodec represents the audio codec type.
type AudioCodec string

const (
	AudioCodecAAC   AudioCodec = "aac"
	AudioCodecMP3   AudioCodec = "mp3"
	AudioCodecOpus  AudioCodec = "opus"
	AudioCodecVorbis AudioCodec = "vorbis"
	AudioCodecUnknown AudioCodec = "unknown"
)

// ContainerFormat represents the media container format.
type ContainerFormat string

const (
	ContainerMKV    ContainerFormat = "mkv"
	ContainerMP4    ContainerFormat = "mp4"
	ContainerWebM   ContainerFormat = "webm"
	ContainerUnknown ContainerFormat = "unknown"
)

// CodecInfo holds codec parameters detected from a media file.
type CodecInfo struct {
	Video    VideoCodec
	Audio    AudioCodec
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
	// Probe pipeline to detect codec info
	pipelineStr := fmt.Sprintf("filesrc location=%s ! decodebin name=dec ! fakesink",
		escapeFilePath(filePath))

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return CodecInfo{}, fmt.Errorf("failed to parse probe pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return CodecInfo{}, fmt.Errorf("element is not a pipeline")
	}

	bus := pipeline.Bus()
	if bus == nil {
		return CodecInfo{}, fmt.Errorf("failed to get bus")
	}

	// Set up to get source pad info from decodebin
	resultCh := make(chan CodecInfo, 1)
	errorCh := make(chan error, 1)

	bus.AddSignalWatch()
	bus.Connect("message", func(bus *gst.Bus, msg *gst.Message) {
		switch msg.Type() {
		case gst.MessageError:
			err, _ := msg.ParseError()
			errorCh <- err
		case gst.MessageEos:
			// EOS without codec info means we couldn't detect
			select {
			case <-resultCh:
			default:
				errorCh <- fmt.Errorf("failed to detect codec: EOS received")
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

// DetectCodecInfo is a convenience function that uses GstCodecDetector.
func DetectCodecInfo(filePath string) (CodecInfo, error) {
	detector := NewGstCodecDetector()
	return detector.Detect(filePath)
}