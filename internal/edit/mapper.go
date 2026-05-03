package edit

import (
	"sort"
)

type TranscriptMapper struct {
	words []WordData
}

func NewTranscriptMapper(words []WordData) *TranscriptMapper {
	return &TranscriptMapper{words: words}
}

func (tm *TranscriptMapper) SetWords(words []WordData) {
	tm.words = words
}

func (tm *TranscriptMapper) WordAtTime(time float64) int {
	if len(tm.words) == 0 {
		return -1
	}

	idx := sort.Search(len(tm.words), func(i int) bool {
		return tm.words[i].StartTime > time
	})

	if idx == 0 {
		return 0
	}

	if idx >= len(tm.words) {
		return len(tm.words) - 1
	}

	if tm.words[idx].StartTime > time && tm.words[idx-1].EndTime >= time {
		return idx - 1
	}

	return idx
}

func (tm *TranscriptMapper) TimeRangeForWords(fromIdx, toIdx int) (float64, float64) {
	if fromIdx < 0 || fromIdx >= len(tm.words) {
		return 0, 0
	}
	if toIdx <= 0 || toIdx > len(tm.words) {
		return 0, 0
	}
	if fromIdx >= toIdx {
		return 0, 0
	}

	return tm.words[fromIdx].StartTime, tm.words[toIdx-1].EndTime
}

func (tm *TranscriptMapper) SentenceBoundaries() []int {
	if len(tm.words) == 0 {
		return nil
	}

	var boundaries []int
	boundaryChars := map[rune]bool{
		'.': true, '!': true, '?': true, ';': true, ':': true,
	}

	for i, w := range tm.words {
		if i == 0 {
			continue
		}
		text := w.Text
		if len(text) > 0 {
			lastChar := rune(text[len(text)-1])
			if boundaryChars[lastChar] {
				boundaries = append(boundaries, i)
			}
		}
	}

	return boundaries
}

func (tm *TranscriptMapper) ParagraphBoundaries() []int {
	if len(tm.words) == 0 {
		return nil
	}

	var boundaries []int

	for i, w := range tm.words {
		if i == 0 {
			continue
		}
		if w.Text == "" || w.Text == "\n" || w.Text == "\r\n" {
			boundaries = append(boundaries, i)
		}
	}

	return boundaries
}

func (tm *TranscriptMapper) IndexAtTime(time float64) int {
	return tm.WordAtTime(time)
}

func (tm *TranscriptMapper) Duration() float64 {
	if len(tm.words) == 0 {
		return 0
	}
	return tm.words[len(tm.words)-1].EndTime - tm.words[0].StartTime
}

var _ sort.Interface = (*TranscriptMapper)(nil)

func (tm *TranscriptMapper) Len() int {
	return len(tm.words)
}

func (tm *TranscriptMapper) Less(i, j int) bool {
	return tm.words[i].StartTime < tm.words[j].StartTime
}

func (tm *TranscriptMapper) Swap(i, j int) {
	tm.words[i], tm.words[j] = tm.words[j], tm.words[i]
}
