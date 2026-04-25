package filler

import (
	"strings"
	"time"
)

type FillerType int

const (
	TypeUnknown FillerType = iota
	TypeShortFiller
	TypeHesitation
	TypeRepetition
)

func (t FillerType) String() string {
	switch t {
	case TypeShortFiller:
		return "short_filler"
	case TypeHesitation:
		return "hesitation"
	case TypeRepetition:
		return "repetition"
	default:
		return "unknown"
	}
}

type FillerWord struct {
	Text  string
	Start float64
	End   float64
	Type  FillerType
}

type Word struct {
	Text  string
	Start float64
	End   float64
}

func (w Word) StartTime() time.Duration {
	return time.Duration(w.Start * float64(time.Second))
}

func (w Word) EndTime() time.Duration {
	return time.Duration(w.End * float64(time.Second))
}

type Config struct {
	EnableShortFillers bool
	EnableHesitation   bool
	EnableRepetition   bool
	RepetitionWindow   float64
}

func DefaultConfig() Config {
	return Config{
		EnableShortFillers: true,
		EnableHesitation:  true,
		EnableRepetition:  true,
		RepetitionWindow:  2.0,
	}
}

type Detector interface {
	Detect(words []Word) []*FillerWord
}

type DefaultDetector struct {
	config Config
}

func NewDefaultDetector(cfg Config) *DefaultDetector {
	return &DefaultDetector{config: cfg}
}

var shortFillers = map[string]bool{
	"um":  true,
	"uh":  true,
	"hm":  true,
	"mm":  true,
	"ah":  true,
	"er":  true,
	"huh": true,
}

var hesitationPhrases = [][]string{
	{"like"},
	{"you", "know"},
	{"I", "mean"},
	{"sort", "of"},
	{"kind", "of"},
	{"basically"},
	{"actually"},
	{"so"},
	{"right"},
	{"you", "know", "what", "I", "mean"},
}

func (d *DefaultDetector) Detect(words []Word) []*FillerWord {
	var fillers []*FillerWord

	for i, word := range words {
		text := strings.ToLower(word.Text)

		if d.config.EnableShortFillers && d.isShortFiller(text) {
			fillers = append(fillers, &FillerWord{
				Text:  word.Text,
				Start: word.Start,
				End:   word.End,
				Type:  TypeShortFiller,
			})
			continue
		}

		if d.config.EnableHesitation && d.isHesitation(words, i, text) {
			fillers = append(fillers, &FillerWord{
				Text:  word.Text,
				Start: word.Start,
				End:   word.End,
				Type:  TypeHesitation,
			})
			continue
		}
	}

	if d.config.EnableRepetition {
		fillers = append(fillers, d.detectRepetition(words)...)
	}

	return fillers
}

func (d *DefaultDetector) isShortFiller(text string) bool {
	_, ok := shortFillers[text]
	return ok
}

func (d *DefaultDetector) isHesitation(words []Word, idx int, text string) bool {
	for _, phrase := range hesitationPhrases {
		if d.matchesPhrase(words, idx, phrase) {
			return true
		}
	}
	return false
}

func (d *DefaultDetector) matchesPhrase(words []Word, idx int, phrase []string) bool {
	if len(phrase) == 0 {
		return false
	}

	if strings.ToLower(words[idx].Text) != phrase[0] {
		return false
	}

	if len(phrase) == 1 {
		return true
	}

	endIdx := idx + len(phrase)
	if endIdx > len(words) {
		return false
	}

	for j, expected := range phrase[1:] {
		if strings.ToLower(words[idx+j+1].Text) != expected {
			return false
		}
	}

	return true
}

func (d *DefaultDetector) detectRepetition(words []Word) []*FillerWord {
	var fillers []*FillerWord

	for i := 0; i < len(words); i++ {
		text := strings.ToLower(words[i].Text)
		if text == "" {
			continue
		}

		for j := i + 1; j < len(words); j++ {
			otherText := strings.ToLower(words[j].Text)
			if otherText != text {
				break
			}

			timeDiff := words[j].Start - words[i].Start
			if timeDiff > d.config.RepetitionWindow {
				break
			}

			fillers = append(fillers, &FillerWord{
				Text:  words[j].Text,
				Start: words[j].Start,
				End:   words[j].End,
				Type:  TypeRepetition,
			})
		}
	}

	return fillers
}