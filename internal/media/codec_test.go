package media

import (
	"testing"
)

func TestVideoCodecConstants(t *testing.T) {
	codecs := []VideoCodec{VideoCodecH264, VideoCodecH265, VideoCodecVP8, VideoCodecVP9, VideoCodecAV1, VideoCodecUnknown}
	for _, c := range codecs {
		if c == "" {
			t.Errorf("VideoCodec constant should not be empty")
		}
	}
}

func TestAudioCodecConstants(t *testing.T) {
	codecs := []AudioCodec{AudioCodecAAC, AudioCodecMP3, AudioCodecOpus, AudioCodecVorbis, AudioCodecUnknown}
	for _, c := range codecs {
		if c == "" {
			t.Errorf("AudioCodec constant should not be empty")
		}
	}
}

func TestContainerFormatConstants(t *testing.T) {
	containers := []ContainerFormat{ContainerMKV, ContainerMP4, ContainerWebM, ContainerUnknown}
	for _, c := range containers {
		if c == "" {
			t.Errorf("ContainerFormat constant should not be empty")
		}
	}
}

func TestCodecInfo_CanStreamCopy(t *testing.T) {
	tests := []struct {
		name     string
		codec    CodecInfo
		expected bool
	}{
		{"H264 can stream copy", CodecInfo{Video: VideoCodecH264}, true},
		{"H265 can stream copy", CodecInfo{Video: VideoCodecH265}, true},
		{"VP8 can stream copy", CodecInfo{Video: VideoCodecVP8}, true},
		{"VP9 can stream copy", CodecInfo{Video: VideoCodecVP9}, true},
		{"AV1 cannot stream copy", CodecInfo{Video: VideoCodecAV1}, false},
		{"Unknown cannot stream copy", CodecInfo{Video: VideoCodecUnknown}, false},
		{"H264 with audio", CodecInfo{Video: VideoCodecH264, Audio: AudioCodecAAC}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.codec.CanStreamCopy()
			if got != tt.expected {
				t.Errorf("CodecInfo.CanStreamCopy() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestCodecInfo_String(t *testing.T) {
	codec := CodecInfo{Video: VideoCodecH264, Audio: AudioCodecAAC, Container: ContainerMKV}
	result := codec.String()
	expected := "CodecInfo{Video:h264, Audio:aac, Container:mkv}"
	if result != expected {
		t.Errorf("CodecInfo.String() = %q, want %q", result, expected)
	}
}

func TestNewGstCodecDetector(t *testing.T) {
	detector := NewGstCodecDetector()
	if detector == nil {
		t.Fatal("NewGstCodecDetector returned nil")
	}
}