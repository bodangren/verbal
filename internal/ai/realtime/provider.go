package realtime

import (
	"context"

	"verbal/internal/ai"
)

type StreamingProvider interface {
	Name() string
	StartStreaming(ctx context.Context, config StreamingConfig) (StreamingSession, error)
}

type StreamingConfig struct {
	SampleRate    int
	Channels      int
	Format        string
	Language      string
	OnPartialResult func([]ai.Word)
	OnFinalResult   func([]ai.Word)
	OnError         func(error)
}

type StreamingSession interface {
	SendAudio(chunk []byte) error
	Close() error
}