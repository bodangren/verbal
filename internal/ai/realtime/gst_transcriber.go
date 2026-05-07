package realtime

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
)

type GstTranscriber struct {
	mu           sync.RWMutex
	state        TranscriberState
	audioFormat  string
	sampleRate   int
	channels     int
	providerName string
	listener     net.Listener
	stopChan     chan struct{}
	onWordLock   sync.Mutex
	callbacks    []func(WordData)
}

type GstTranscriberConfig struct {
	AudioFormat  string
	SampleRate   int
	Channels     int
	ProviderName string
}

func NewGstTranscriber(config GstTranscriberConfig) *GstTranscriber {
	if config.SampleRate == 0 {
		config.SampleRate = 16000
	}
	if config.Channels == 0 {
		config.Channels = 1
	}
	if config.AudioFormat == "" {
		config.AudioFormat = "S16LE"
	}

	return &GstTranscriber{
		state:        StateReady,
		audioFormat:  config.AudioFormat,
		sampleRate:   config.SampleRate,
		channels:     config.Channels,
		providerName: config.ProviderName,
		stopChan:     make(chan struct{}),
	}
}

func (gt *GstTranscriber) Start() error {
	gt.mu.Lock()
	defer gt.mu.Unlock()

	if gt.state != StateReady {
		return fmt.Errorf("transcriber already started or in error state")
	}

	gt.state = StateStreaming
	return nil
}

func (gt *GstTranscriber) Stop() error {
	gt.mu.Lock()
	defer gt.mu.Unlock()

	if gt.state != StateStreaming {
		return nil
	}

	close(gt.stopChan)
	gt.state = StateStopped
	return nil
}

func (gt *GstTranscriber) OnWord(callback func(WordData)) {
	gt.onWordLock.Lock()
	defer gt.onWordLock.Unlock()
	gt.callbacks = append(gt.callbacks, callback)
}

func (gt *GstTranscriber) State() TranscriberState {
	gt.mu.RLock()
	defer gt.mu.RUnlock()
	return gt.state
}

func (gt *GstTranscriber) emitWord(word WordData) {
	gt.onWordLock.Lock()
	callbacks := make([]func(WordData), len(gt.callbacks))
	copy(callbacks, gt.callbacks)
	gt.onWordLock.Unlock()

	for _, cb := range callbacks {
		cb(word)
	}
}

func (gt *GstTranscriber) PipelineString(audioSrc string) string {
	return fmt.Sprintf(
		"%s ! queue ! audioconvert ! audioresample ! audio/x-raw,format=%s,rate=%d,channels=%d ! tcpserversink name=sink host=localhost port=0",
		audioSrc,
		gt.audioFormat,
		gt.sampleRate,
		gt.channels,
	)
}

func (gt *GstTranscriber) StartTCPServer() (string, error) {
	ln, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		return "", fmt.Errorf("failed to create TCP server: %w", err)
	}

	port := ln.Addr().(*net.TCPAddr).Port
	addr := fmt.Sprintf("localhost:%d", port)

	go func() {
		defer ln.Close()
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		gt.handleAudioConnection(conn)
	}()

	return addr, nil
}

func (gt *GstTranscriber) handleAudioConnection(conn net.Conn) {
	defer conn.Close()

	buf := make([]byte, 4096)
	for {
		select {
		case <-gt.stopChan:
			return
		default:
			conn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
			n, err := conn.Read(buf)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue
				}
				if err == io.EOF {
					return
				}
				return
			}
			if n > 0 {
				gt.processAudioChunk(buf[:n])
			}
		}
	}
}

func (gt *GstTranscriber) processAudioChunk(chunk []byte) {
}

func (gt *GstTranscriber) BuildPipeline(audioSrc string) (*gst.Pipeline, error) {
	pipelineStr := gt.PipelineString(audioSrc)

	element, err := gst.ParseLaunch(pipelineStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse pipeline: %w", err)
	}

	pipeline, ok := element.(*gst.Pipeline)
	if !ok {
		return nil, fmt.Errorf("element is not a pipeline")
	}

	return pipeline, nil
}

func (gt *GstTranscriber) ValidateAudioSource(source string) bool {
	validPrefixes := []string{
		"pulsesrc",
		"autoaudiosrc",
		"alsasrc",
		"filesrc",
		"device://",
	}

	for _, prefix := range validPrefixes {
		if strings.HasPrefix(source, prefix) {
			return true
		}
	}
	return false
}

func (gt *GstTranscriber) GetAudioFormat() (format string, rate, channels int) {
	return gt.audioFormat, gt.sampleRate, gt.channels
}

func (gt *GstTranscriber) Close() error {
	gt.mu.Lock()
	defer gt.mu.Unlock()

	if gt.listener != nil {
		gt.listener.Close()
	}

	if gt.state == StateStreaming {
		close(gt.stopChan)
	}

	gt.state = StateStopped
	return nil
}

func SanitizeLocationArg(path string) string {
	sanitized := strings.ReplaceAll(path, "\"", "")
	sanitized = strings.ReplaceAll(sanitized, "\\", "")
	sanitized = strings.ReplaceAll(sanitized, "\n", "")
	sanitized = strings.ReplaceAll(sanitized, "\r", "")
	sanitized = strings.ReplaceAll(sanitized, ";", "")
	return sanitized
}

func EnsureDir(path string) error {
	dir := filepath.Dir(path)
	if dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0755)
}