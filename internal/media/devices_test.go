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
	if os.Getenv("CI") != "" {
		t.Skip("skipping in CI (no /dev/video*)")
	}
}
