package media

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestGetDeviceName_FallbackToBase(t *testing.T) {
	tmpDir := t.TempDir()
	videoDir := filepath.Join(tmpDir, "video4linux")
	if err := os.MkdirAll(videoDir, 0o755); err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	linkName := filepath.Join(videoDir, "video99")
	if err := os.Symlink("/dev/null", linkName); err != nil {
		t.Fatalf("Failed to create symlink: %v", err)
	}

	name := getDeviceName(linkName)
	if name != "video99" {
		t.Errorf("Expected base name 'video99', got %q", name)
	}
}

func TestGetDefaultVideoDevice(t *testing.T) {
	dev, err := GetDefaultVideoDevice()
	if err != nil {
		t.Skip("No video devices available:", err)
	}
	if dev == nil {
		t.Fatal("GetDefaultVideoDevice returned nil device")
	}
	if dev.Type != DeviceVideo {
		t.Errorf("Expected DeviceVideo, got %v", dev.Type)
	}
	if dev.Path == "" {
		t.Error("Path should not be empty")
	}
}

func TestGetDefaultAudioDevice(t *testing.T) {
	dev, err := GetDefaultAudioDevice()
	if err != nil {
		t.Skip("No audio devices available:", err)
	}
	if dev == nil {
		t.Fatal("GetDefaultAudioDevice returned nil device")
	}
	if dev.Type != DeviceAudio {
		t.Errorf("Expected DeviceAudio, got %v", dev.Type)
	}
	if dev.Path == "" {
		t.Error("Path should not be empty")
	}
}

func TestHasVideoDevice(t *testing.T) {
	has, devs := HasVideoDevice(), func() []Device {
		d, _ := ListVideoDevices()
		return d
	}()
	if has && len(devs) == 0 {
		t.Error("HasVideoDevice should be false when no devices")
	}
}

func TestGetDefaultVideoDevice_NoDevices(t *testing.T) {
	entries, err := filepath.Glob("/dev/video*")
	if err != nil || len(entries) == 0 {
		t.Skip("No video devices to test fallback behavior")
	}
}

func TestGetDefaultAudioDevice_AllNonDefault(t *testing.T) {
	_, err := exec.LookPath("wpctl")
	if err != nil {
		t.Skip("wpctl not available:", err)
	}

	output := `Audio
 ├─ Sources:
 │  52. Only Microphone [vol: 0.50]
`
	devices := parseWpctlSources(output)
	if len(devices) != 1 {
		t.Fatalf("Expected 1 device, got %d", len(devices))
	}
	if devices[0].IsDefault {
		t.Error("Only device should not be marked default when no asterisk")
	}
}

func TestListAudioDevices_WithWpctlOutput(t *testing.T) {
	output := `Audio
 ├─ Sources:
 │  51. Internal Microphone [vol: 0.50]
 │  *52. USB Headset [vol: 0.75]
 │  53. HDMI Input [vol: 1.00]
`
	devices := parseWpctlSources(output)
	if len(devices) != 3 {
		t.Fatalf("Expected 3 devices, got %d", len(devices))
	}

	expected := []struct {
		name      string
		isDefault bool
		vol       float64
	}{
		{"Internal Microphone", false, 0.50},
		{"USB Headset", true, 0.75},
		{"HDMI Input", false, 1.00},
	}

	for i, d := range devices {
		if d.Name != expected[i].name {
			t.Errorf("device[%d].Name = %q, want %q", i, d.Name, expected[i].name)
		}
		if d.IsDefault != expected[i].isDefault {
			t.Errorf("device[%d].IsDefault = %v, want %v", i, d.IsDefault, expected[i].isDefault)
		}
		if d.Volume != expected[i].vol {
			t.Errorf("device[%d].Volume = %v, want %v", i, d.Volume, expected[i].vol)
		}
	}
}

func TestListAudioDevices_NoDefaultMarker(t *testing.T) {
	output := `Audio
 ├─ Sources:
 │  52. Only Microphone [vol: 0.50]
`
	devices := parseWpctlSources(output)
	if len(devices) != 1 {
		t.Fatalf("Expected 1 device, got %d", len(devices))
	}
	if devices[0].IsDefault {
		t.Error("Only device should not be marked default when no asterisk")
	}
}

func TestParseWpctlSources_WithVolume(t *testing.T) {
	output := `Audio
 ├─ Sources:
 │  42. Pro Audio Interface [vol: 0.25]
 │  *43. Chat Mic [vol: 0.90]
`
	devices := parseWpctlSources(output)
	if len(devices) != 2 {
		t.Fatalf("Expected 2 devices, got %d", len(devices))
	}

	if devices[0].Volume != 0.25 {
		t.Errorf("device[0].Volume = %v, want 0.25", devices[0].Volume)
	}
	if devices[1].Volume != 0.90 {
		t.Errorf("device[1].Volume = %v, want 0.90", devices[1].Volume)
	}
}

func TestParseWpctlSources_TrimsTreeChars(t *testing.T) {
	output := `Audio
 │ ├─ Sources:
 │ │   42. Test Device [vol: 0.50]
`
	devices := parseWpctlSources(output)
	if len(devices) != 1 {
		t.Fatalf("Expected 1 device, got %d", len(devices))
	}
	if devices[0].Name != "Test Device" {
		t.Errorf("Name = %q, want %q", devices[0].Name, "Test Device")
	}
}

func TestGetDeviceName_NonExistentPath(t *testing.T) {
	name := getDeviceName("/sys/class/video4linux/nonexistent")
	if name != "nonexistent" {
		t.Errorf("Expected 'nonexistent', got %q", name)
	}
}

func TestListVideoDevices_RealDevices(t *testing.T) {
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