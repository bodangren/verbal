package realtime

import (
	"verbal/internal/ai"
)

type WordDataToWordConverter struct{}

func NewWordDataToWordConverter() *WordDataToWordConverter {
	return &WordDataToWordConverter{}
}

func (c *WordDataToWordConverter) ConvertWordDataToWord(wd WordData) ai.Word {
	return ai.Word{
		Text:  wd.Text,
		Start: wd.StartTime,
		End:   wd.EndTime,
	}
}

func (c *WordDataToWordConverter) ConvertWordDataSlice(wds []WordData) []ai.Word {
	result := make([]ai.Word, len(wds))
	for i, wd := range wds {
		result[i] = c.ConvertWordDataToWord(wd)
	}
	return result
}