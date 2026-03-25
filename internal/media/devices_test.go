package media

import (
	"os"
	"testing"
)

func TestDeviceTypeString(t *testing.T) {
	tests := []struct {
		dt       DeviceType
		expected string
	}{
		{DeviceVideo, "video"},
		{DeviceAudio, "audio"},
		{DeviceType(99), "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			if got := tt.dt.String(); got != tt.expected {
				t.Errorf("DeviceType.String() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestListVideoDevices(t *testing.T) {
	devices, err := ListVideoDevices()

	if _, statErr := os.Stat("/dev"); os.IsNotExist(statErr) {
		t.Skip("no /dev directory")
	}

	if err != nil {
		t.Logf("ListVideoDevices returned error (expected on systems without video devices): %v", err)
		return
	}

	for _, d := range devices {
		if d.Type != DeviceVideo {
			t.Errorf("device %s has wrong type: %v", d.Name, d.Type)
		}
		if d.Path == "" {
			t.Errorf("device %s has empty path", d.Name)
		}
	}
}

func TestListAudioDevices(t *testing.T) {
	devices, err := ListAudioDevices()
	if err != nil {
		t.Fatalf("ListAudioDevices returned error: %v", err)
	}

	if len(devices) == 0 {
		t.Error("ListAudioDevices should always return at least 'default'")
	}

	if devices[0].Path != "default" {
		t.Errorf("expected default audio device, got %s", devices[0].Path)
	}
}

func TestGetDefaultVideoDevice_NoDevices(t *testing.T) {
	if HasVideoDevice() {
		t.Skip("skipping test - video devices exist on this system")
	}

	_, err := GetDefaultVideoDevice()
	if err == nil {
		t.Error("expected error when no video devices found")
	}
}

func TestHasVideoDevice(t *testing.T) {
	_ = HasVideoDevice()
}

func TestHasAudioDevice(t *testing.T) {
	result := HasAudioDevice()
	if !result {
		t.Error("HasAudioDevice should return true (we always have 'default')")
	}
}

func TestGetDeviceName(t *testing.T) {
	name := getDeviceName("/dev/video0")
	if name == "" {
		t.Error("getDeviceName returned empty string")
	}
}
