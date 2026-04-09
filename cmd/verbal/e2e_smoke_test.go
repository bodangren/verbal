package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2E_BinaryBuildAndStartupSmoke(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping e2e smoke in short mode")
	}

	repoRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}

	tmpDir := t.TempDir()
	binPath := filepath.Join(tmpDir, "verbal-smoke")

	buildCmd := exec.Command("go", "build", "-o", binPath, "./cmd/verbal")
	buildCmd.Dir = repoRoot
	buildOut, err := buildCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build failed: %v\n%s", err, string(buildOut))
	}

	homeDir := filepath.Join(tmpDir, "home")
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		t.Fatalf("create temporary HOME: %v", err)
	}

	runCmd := exec.Command(binPath, smokeCheckArg)
	runCmd.Dir = repoRoot
	runCmd.Env = append(
		os.Environ(),
		"HOME="+homeDir,
		"DISPLAY=",
		"WAYLAND_DISPLAY=",
	)

	runOut, err := runCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("startup smoke execution failed: %v\n%s", err, string(runOut))
	}
	if !strings.Contains(string(runOut), "smoke-check:ok") {
		t.Fatalf("unexpected smoke output: %s", string(runOut))
	}
}
