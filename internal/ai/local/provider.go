package local

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type ModelSize string

const (
	ModelTiny   ModelSize = "tiny"
	ModelBase   ModelSize = "base"
	ModelSmall  ModelSize = "small"
	ModelMedium ModelSize = "medium"
	ModelLarge  ModelSize = "large"
)

const (
	ModelTinyURL   = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"
	ModelBaseURL   = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
	ModelSmallURL  = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
	ModelMediumURL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin"
	ModelLargeURL  = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large.bin"
)

func (m ModelSize) URL() string {
	switch m {
	case ModelTiny:
		return ModelTinyURL
	case ModelBase:
		return ModelBaseURL
	case ModelSmall:
		return ModelSmallURL
	case ModelMedium:
		return ModelMediumURL
	case ModelLarge:
		return ModelLargeURL
	}
	return ""
}

func (m ModelSize) String() string {
	return string(m)
}

type TranscriptionResult struct {
	Text     string
	Words    []Word
	Language string
	Duration float64
}

type Word struct {
	Text  string
	Start float64
	End   float64
}

type Provider interface {
	Name() string
	Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error)
}

type LocalProvider struct {
	modelPath string
	modelSize ModelSize
}

func NewLocalProvider(modelPath string) *LocalProvider {
	return &LocalProvider{
		modelPath: modelPath,
		modelSize: guessModelSize(modelPath),
	}
}

func NewLocalProviderWithSize(modelPath string, size ModelSize) *LocalProvider {
	return &LocalProvider{
		modelPath: modelPath,
		modelSize: size,
	}
}

func (p *LocalProvider) Name() string {
	return fmt.Sprintf("Local Whisper (%s)", p.modelSize)
}

func (p *LocalProvider) Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error) {
	if err := p.validateModel(); err != nil {
		return nil, err
	}

	result, err := p.runWhisper(ctx, audioPath)
	if err != nil {
		return nil, fmt.Errorf("whisper transcription: %w", err)
	}

	return result, nil
}

func (p *LocalProvider) validateModel() error {
	info, err := os.Stat(p.modelPath)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("model file not found at %s; download from %s", p.modelPath, p.modelSize.URL())
		}
		return fmt.Errorf("stat model file: %w", err)
	}
	if info.Size() == 0 {
		return fmt.Errorf("model file is empty")
	}
	return nil
}

func (p *LocalProvider) runWhisper(ctx context.Context, audioPath string) (*TranscriptionResult, error) {
	tmpDir := os.TempDir()
	baseName := filepath.Base(audioPath)
	txtPath := filepath.Join(tmpDir, baseName+".whisper.txt")
	jsonPath := filepath.Join(tmpDir, baseName+".whisper.json")

	_ = os.Remove(txtPath)
	_ = os.Remove(jsonPath)

	cmd := exec.CommandContext(ctx, "whisper-cli",
		"-m", p.modelPath,
		"-f", audioPath,
		"-otxt",
		"-oj",
		"-o", tmpDir,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("whisper-cli failed: %w (output: %s)", err, strings.TrimSpace(string(output)))
	}

	result, err := parseWhisperJSONFile(jsonPath)
	if err != nil {
		return nil, err
	}

	_ = os.Remove(txtPath)
	_ = os.Remove(jsonPath)

	return result, nil
}

func parseWhisperJSONFile(path string) (*TranscriptionResult, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read whisper output: %w", err)
	}

	var wrapper struct {
		Text     string `json:"text"`
		Language  string `json:"language"`
		Duration  float64 `json:"duration"`
		Words     []struct {
			Text  string  `json:"w"`
			Start float64 `json:"ws"`
			End   float64 `json:"we"`
		} `json:"transcription"`
	}

	if err := json.Unmarshal(data, &wrapper); err != nil {
		return nil, fmt.Errorf("parse whisper JSON: %w", err)
	}

	result := &TranscriptionResult{
		Text:     wrapper.Text,
		Language: wrapper.Language,
		Duration: wrapper.Duration,
		Words:    make([]Word, len(wrapper.Words)),
	}

	for i, w := range wrapper.Words {
		result.Words[i] = Word{
			Text:  w.Text,
			Start: w.Start,
			End:   w.End,
		}
	}

	return result, nil
}

func guessModelSize(modelPath string) ModelSize {
	switch {
	case contains(modelPath, "tiny"):
		return ModelTiny
	case contains(modelPath, "base"):
		return ModelBase
	case contains(modelPath, "small"):
		return ModelSmall
	case contains(modelPath, "medium"):
		return ModelMedium
	case contains(modelPath, "large"):
		return ModelLarge
	}
	return ModelBase
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func ModelPathForSize(modelDir string, size ModelSize) string {
	return fmt.Sprintf("%s/ggml-%s.bin", modelDir, size)
}

type DownloadProgress struct {
	Downloaded int64
	Total      int64
	Message    string
}

type ModelDownloader struct {
	modelSize ModelSize
	modelDir  string
	onProgress func(DownloadProgress)
}

func NewModelDownloader(modelDir string, size ModelSize, onProgress func(DownloadProgress)) *ModelDownloader {
	return &ModelDownloader{
		modelDir:  modelDir,
		modelSize: size,
		onProgress: onProgress,
	}
}

func (d *ModelDownloader) Download(ctx context.Context) (string, error) {
	url := d.modelSize.URL()
	modelPath := ModelPathForSize(d.modelDir, d.modelSize)

	if d.onProgress != nil {
		d.onProgress(DownloadProgress{Message: "Starting download..."})
	}

	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("fetch model: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}

	total := resp.ContentLength

	outFile, err := os.Create(modelPath + ".tmp")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	defer os.Remove(outFile.Name())
	defer outFile.Close()

	buf := make([]byte, 32*1024)
	downloaded := int64(0)

	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		default:
		}

		n, err := resp.Body.Read(buf)
		if n > 0 {
			written, wErr := outFile.Write(buf[:n])
			if wErr != nil {
				return "", fmt.Errorf("write error: %w", wErr)
			}
			downloaded += int64(written)

			if d.onProgress != nil && total > 0 {
				d.onProgress(DownloadProgress{
					Downloaded: downloaded,
					Total:      total,
					Message:    fmt.Sprintf("Downloading... %.0f%%", float64(downloaded)/float64(total)*100),
				})
			}
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			return "", fmt.Errorf("read error: %w", err)
		}
	}

	outFile.Close()

	if err := os.Rename(modelPath+".tmp", modelPath); err != nil {
		return "", fmt.Errorf("rename file: %w", err)
	}

	if d.onProgress != nil {
		d.onProgress(DownloadProgress{Message: "Download complete"})
	}

	return modelPath, nil
}