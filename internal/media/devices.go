package media

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type DeviceType int

const (
	DeviceVideo DeviceType = iota
	DeviceAudio
)

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

type Device struct {
	Name      string
	Path      string
	Type      DeviceType
	IsDefault bool
}

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

func ListAudioDevices() ([]Device, error) {
	var devices []Device

	sources, err := listPulseAudioSources()
	if err != nil {
		return nil, err
	}

	for i, source := range sources {
		devices = append(devices, Device{
			Name:      source,
			Path:      source,
			Type:      DeviceAudio,
			IsDefault: i == 0,
		})
	}

	return devices, nil
}

func GetDefaultVideoDevice() (*Device, error) {
	devices, err := ListVideoDevices()
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

	return nil, fmt.Errorf("no video devices found")
}

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

func HasVideoDevice() bool {
	devices, err := ListVideoDevices()
	return err == nil && len(devices) > 0
}

func HasAudioDevice() bool {
	devices, err := ListAudioDevices()
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

func listPulseAudioSources() ([]string, error) {
	return []string{"default"}, nil
}
