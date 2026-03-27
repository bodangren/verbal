package ai

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadEnvFromDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	envFile := filepath.Join(tmpDir, ".env")

	content := "OPENAI_API_KEY=test-key-from-dotenv\nGOOGLE_API_KEY=google-test-key\n"
	if err := os.WriteFile(envFile, []byte(content), 0600); err != nil {
		t.Fatalf("failed to write .env: %v", err)
	}

	os.Unsetenv("OPENAI_API_KEY")
	os.Unsetenv("GOOGLE_API_KEY")

	if err := LoadEnvFromFile(envFile); err != nil {
		t.Fatalf("LoadEnvFromFile failed: %v", err)
	}

	if got := os.Getenv("OPENAI_API_KEY"); got != "test-key-from-dotenv" {
		t.Errorf("OPENAI_API_KEY = %q, want %q", got, "test-key-from-dotenv")
	}
	if got := os.Getenv("GOOGLE_API_KEY"); got != "google-test-key" {
		t.Errorf("GOOGLE_API_KEY = %q, want %q", got, "google-test-key")
	}

	os.Unsetenv("OPENAI_API_KEY")
	os.Unsetenv("GOOGLE_API_KEY")
}

func TestLoadEnvFromFileNotFound(t *testing.T) {
	err := LoadEnvFromFile("/nonexistent/path/.env")
	if err != nil {
		t.Errorf("LoadEnvFromFile should not error on missing file, got: %v", err)
	}
}

func TestLoadEnvFromDirectoryNoEnvFile(t *testing.T) {
	tmpDir := t.TempDir()
	envFile := filepath.Join(tmpDir, ".env")
	err := LoadEnvFromFile(envFile)
	if err != nil {
		t.Errorf("LoadEnvFromFile should not error when .env missing, got: %v", err)
	}
}
