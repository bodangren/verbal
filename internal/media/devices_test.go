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
		got := tt.dt.String()
		if got != tt.expected {
			t.Errorf("DeviceType(%d).String() = %q, want %q", tt.dt, got, tt.expected)
		}
	}
}

func TestParseWpctlSources_Empty(t *testing.T) {
	devices := parseWpctlSources("")
	if len(devices) != 1 || !devices[0].IsDefault {
		t.Errorf("expected fallback device for empty output, got %v", devices)
	}
}

func TestParseWpctlSources_WithSources(t *testing.T) {
	output := `Audio
 ├─ Sources:
 │   52. Built-in Audio Analog Stereo [vol: 0.03]
 │  *53. USB Microphone [vol: 0.85]
`
	devices := parseWpctlSources(output)
	if len(devices) != 2 {
		t.Fatalf("expected 2 devices, got %d", len(devices))
	}
	if devices[0].Name != "Built-in Audio Analog Stereo" {
		t.Errorf("unexpected name: %s", devices[0].Name)
	}
	if devices[0].IsDefault {
		t.Error("first device should not be default")
	}
	if !devices[1].IsDefault {
		t.Error("second device should be default")
	}
	if devices[1].Name != "USB Microphone" {
		t.Errorf("unexpected name: %s", devices[1].Name)
	}
}

func TestParseWpctlSources_NoSources(t *testing.T) {
	output := `Audio
 ├─ Sinks:
 │   50. Speaker
`
	devices := parseWpctlSources(output)
	if len(devices) != 1 || !devices[0].IsDefault {
		t.Errorf("expected fallback device, got %v", devices)
	}
}

func TestListVideoDevices_NoMockDevices(t *testing.T) {
	devices, err := ListVideoDevices()
	if err != nil {
		t.Fatalf("ListVideoDevices() returned error: %v", err)
	}

	for i, device := range devices {
		if device.Type != DeviceVideo {
			t.Fatalf("device %d type = %v, want %v", i, device.Type, DeviceVideo)
		}
		if device.Path == "" {
			t.Fatalf("device %d has empty path", i)
		}
		if i == 0 && !device.IsDefault {
			t.Fatalf("first device should be marked default")
		}
	}
}

func TestListAudioDevices_FallbackWhenWpctlMissing(t *testing.T) {
	originalPath := os.Getenv("PATH")
	t.Setenv("PATH", t.TempDir())
	t.Cleanup(func() {
		t.Setenv("PATH", originalPath)
	})

	devices, err := ListAudioDevices()
	if err != nil {
		t.Fatalf("ListAudioDevices() returned error: %v", err)
	}
	if len(devices) != 1 {
		t.Fatalf("expected single fallback device, got %d", len(devices))
	}
	if devices[0].Name != "Default Audio Input" {
		t.Fatalf("unexpected fallback name: %q", devices[0].Name)
	}
	if devices[0].Path != "default" {
		t.Fatalf("unexpected fallback path: %q", devices[0].Path)
	}
	if !devices[0].IsDefault {
		t.Fatal("fallback device should be default")
	}
}
