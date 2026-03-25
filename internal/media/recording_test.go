package media

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewRecordingPipelineCreatesPipeline(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "test.webm")
	pipeline, err := NewRecordingPipeline(outputPath)
	if err != nil {
		t.Fatalf("NewRecordingPipeline() error = %v", err)
	}
	if pipeline == nil {
		t.Fatal("NewRecordingPipeline() returned nil pipeline")
	}
}

func TestRecordingPipelineInitialState(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "test.webm")
	pipeline, err := NewRecordingPipeline(outputPath)
	if err != nil {
		t.Fatalf("NewRecordingPipeline() error = %v", err)
	}

	state := pipeline.GetState()
	if state != StateStopped {
		t.Errorf("Initial state = %v, want %v", state, StateStopped)
	}
}

func TestRecordingPipelineStartChangesState(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "test.webm")
	pipeline, err := NewRecordingPipeline(outputPath)
	if err != nil {
		t.Fatalf("NewRecordingPipeline() error = %v", err)
	}

	pipeline.Start()
	state := pipeline.GetState()
	if state != StatePlaying {
		t.Errorf("After Start() state = %v, want %v", state, StatePlaying)
	}

	pipeline.Stop()
}

func TestRecordingPipelineStopChangesState(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "test.webm")
	pipeline, err := NewRecordingPipeline(outputPath)
	if err != nil {
		t.Fatalf("NewRecordingPipeline() error = %v", err)
	}

	pipeline.Start()
	pipeline.Stop()
	state := pipeline.GetState()
	if state != StateStopped {
		t.Errorf("After Stop() state = %v, want %v", state, StateStopped)
	}
}

func TestRecordingPipelineOutputPath(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "test.webm")
	pipeline, err := NewRecordingPipeline(outputPath)
	if err != nil {
		t.Fatalf("NewRecordingPipeline() error = %v", err)
	}

	if pipeline.OutputPath() != outputPath {
		t.Errorf("OutputPath() = %q, want %q", pipeline.OutputPath(), outputPath)
	}
}

func TestNewRecordingPipelineWithEmptyPath(t *testing.T) {
	pipeline, err := NewRecordingPipeline("")
	if err == nil {
		t.Error("NewRecordingPipeline('') expected error, got nil")
		if pipeline != nil {
			pipeline.Stop()
		}
	}
}

func TestRecordingPipelineCreatesOutputDirectory(t *testing.T) {
	outputDir := filepath.Join(t.TempDir(), "subdir", "nested")
	outputPath := filepath.Join(outputDir, "test.webm")

	pipeline, err := NewRecordingPipeline(outputPath)
	if err != nil {
		t.Fatalf("NewRecordingPipeline() error = %v", err)
	}

	if _, statErr := os.Stat(outputDir); os.IsNotExist(statErr) {
		t.Error("Output directory was not created")
	}

	pipeline.Stop()
}

func TestNewRecordingPipelineWithConfig(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "test.webm")
	config := RecordingConfig{
		UseHardware: false,
	}

	pipeline, err := NewRecordingPipelineWithConfig(outputPath, config)
	if err != nil {
		t.Fatalf("NewRecordingPipelineWithConfig() error = %v", err)
	}
	if pipeline == nil {
		t.Fatal("NewRecordingPipelineWithConfig() returned nil pipeline")
	}
	pipeline.Stop()
}

func TestNewRecordingPipelineWithConfigEmptyPath(t *testing.T) {
	config := RecordingConfig{UseHardware: false}
	_, err := NewRecordingPipelineWithConfig("", config)
	if err == nil {
		t.Error("NewRecordingPipelineWithConfig('') expected error, got nil")
	}
}

func TestNewHardwareRecordingPipelineNoDevice(t *testing.T) {
	if HasVideoDevice() {
		t.Skip("skipping - video devices exist on this system")
	}

	outputPath := filepath.Join(t.TempDir(), "test.webm")
	_, err := NewHardwareRecordingPipeline(outputPath)
	if err == nil {
		t.Error("NewHardwareRecordingPipeline expected error when no devices")
	}
}

func TestNewRecordingPipelineWithFallback(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "test.webm")
	pipeline, err := NewRecordingPipelineWithFallback(outputPath)
	if err != nil {
		t.Fatalf("NewRecordingPipelineWithFallback() error = %v", err)
	}
	if pipeline == nil {
		t.Fatal("NewRecordingPipelineWithFallback() returned nil pipeline")
	}
	pipeline.Stop()
}

func TestBuildTestRecordingPipeline(t *testing.T) {
	pipeline := buildTestRecordingPipeline("/tmp/test.webm")
	if pipeline == "" {
		t.Error("buildTestRecordingPipeline returned empty string")
	}
}

func TestBuildHardwareRecordingPipeline(t *testing.T) {
	config := RecordingConfig{
		UseHardware: true,
		VideoDevice: "/dev/video0",
		AudioDevice: "default",
	}
	pipeline := buildHardwareRecordingPipeline("/tmp/test.webm", config)
	if pipeline == "" {
		t.Error("buildHardwareRecordingPipeline returned empty string")
	}
}

func TestBuildHardwareRecordingPipelineDefaults(t *testing.T) {
	config := RecordingConfig{UseHardware: true}
	pipeline := buildHardwareRecordingPipeline("/tmp/test.webm", config)
	if pipeline == "" {
		t.Error("buildHardwareRecordingPipeline returned empty string")
	}
}
