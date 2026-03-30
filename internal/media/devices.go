package media

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// DeviceType represents the type of media device (video or audio).
type DeviceType int

const (
	DeviceVideo DeviceType = iota // Video capture device (e.g., webcam)
	DeviceAudio                   // Audio capture device (e.g., microphone)
)

// String returns a human-readable representation of the device type.
func (d DeviceType) String() string {
	switch d {
	case DeviceVideo:
		return "video"
	case DeviceAudio:
		return "audio"
	default:
		return "unknown"
	}
}

// Device represents a media capture device with its properties.
type Device struct {
	Name      string     // Human-readable device name
	Path      string     // Device path or identifier
	Type      DeviceType // Type of device (video or audio)
	IsDefault bool       // Whether this is the system default device
	Volume    float64    // Current volume level (0.0 - 1.0) for audio devices
}

// ListVideoDevices returns all available video capture devices (webcams).
// Devices are discovered by scanning /dev/video* entries.
func ListVideoDevices() ([]Device, error) {
	var devices []Device
	entries, err := filepath.Glob("/dev/video*")
	if err != nil {
		return nil, fmt.Errorf("failed to list video devices: %w", err)
	}

	for i, path := range entries {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		if info.Mode()&os.ModeCharDevice == 0 {
			continue
		}

		name := getDeviceName(path)
		devices = append(devices, Device{
			Name:      name,
			Path:      path,
			Type:      DeviceVideo,
			IsDefault: i == 0,
		})
	}
	return devices, nil
}

// ListAudioDevices returns all available audio input devices (microphones).
// Uses wpctl (WirePlumber control) to discover PipeWire audio sources.
// Falls back to a default device if wpctl is unavailable.
func ListAudioDevices() ([]Device, error) {
	// Use wpctl status to find sources (microphones)
	cmd := exec.Command("wpctl", "status")
	out, err := cmd.Output()
	if err != nil {
		// Fallback if wpctl fails
		return []Device{{Name: "Default Audio Input", Path: "default", Type: DeviceAudio, IsDefault: true}}, nil
	}

	return parseWpctlSources(string(out)), nil
}

func parseWpctlSources(output string) []Device {
	var devices []Device
	lines := strings.Split(output, "\n")
	inSources := false

	treeChars := "│├└─ ─"

	for _, line := range lines {
		if strings.Contains(line, "Sources:") {
			inSources = true
			continue
		}
		if inSources && strings.TrimSpace(line) == "" {
			break
		}
		if inSources && strings.Contains(line, ".") {
			line = strings.TrimLeft(line, treeChars)
			line = strings.TrimSpace(line)
			isDefault := strings.HasPrefix(line, "*")
			line = strings.TrimPrefix(line, "*")
			line = strings.TrimSpace(line)

			// Format: "52. Built-in Audio Analog Stereo [vol: 0.03]"
			parts := strings.SplitN(line, ".", 2)
			if len(parts) < 2 {
				continue
			}
			id := strings.TrimSpace(parts[0])
			nameVol := strings.TrimSpace(parts[1])

			name := nameVol
			vol := 1.0
			if idx := strings.LastIndex(nameVol, "[vol:"); idx != -1 {
				name = strings.TrimSpace(nameVol[:idx])
				fmt.Sscanf(nameVol[idx:], "[vol: %f]", &vol)
			}

			devices = append(devices, Device{
				Name:      name,
				Path:      id,
				Type:      DeviceAudio,
				IsDefault: isDefault,
				Volume:    vol,
			})
		}
	}

	if len(devices) == 0 {
		return []Device{{Name: "Default Audio Input", Path: "default", Type: DeviceAudio, IsDefault: true}}
	}
	return devices
}

// GetDefaultVideoDevice returns the system's default video capture device.
// Returns an error if no video devices are available.
func GetDefaultVideoDevice() (*Device, error) {
	devices, err := ListVideoDevices()
	if err != nil {
		return nil, err
	}
	if len(devices) > 0 {
		return &devices[0], nil
	}
	return nil, fmt.Errorf("no video devices found")
}

// GetDefaultAudioDevice returns the system's default audio input device.
// Returns an error if no audio devices are available.
func GetDefaultAudioDevice() (*Device, error) {
	devices, err := ListAudioDevices()
	if err != nil {
		return nil, err
	}
	for _, d := range devices {
		if d.IsDefault {
			return &d, nil
		}
	}
	if len(devices) > 0 {
		return &devices[0], nil
	}
	return nil, fmt.Errorf("no audio devices found")
}

// HasVideoDevice returns true if at least one video capture device is available.
func HasVideoDevice() bool {
	devices, err := ListVideoDevices()
	return err == nil && len(devices) > 0
}

func getDeviceName(path string) string {
	base := filepath.Base(path)
	sysfsPath := filepath.Join("/sys/class/video4linux", base, "name")
	if data, err := os.ReadFile(sysfsPath); err == nil {
		return strings.TrimSpace(string(data))
	}
	return base
}
