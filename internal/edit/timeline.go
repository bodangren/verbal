package edit

type EditTimeline struct {
	originalWords []WordData
	currentWords []WordData
	operations   []Operation
}

func NewEditTimeline(words []WordData) *EditTimeline {
	return &EditTimeline{
		originalWords: copyWords(words),
		currentWords:  copyWords(words),
		operations:    make([]Operation, 0),
	}
}

func (et *EditTimeline) ApplyOperation(op Operation) error {
	result, err := op.Apply(et.currentWords)
	if err != nil {
		return err
	}
	et.currentWords = result
	et.operations = append(et.operations, op)
	return nil
}

func (et *EditTimeline) GetCurrentWords() []WordData {
	return copyWords(et.currentWords)
}

func (et *EditTimeline) GetSegmentsForExport() []MediaSegment {
	if len(et.currentWords) == 0 {
		return nil
	}

	var segments []MediaSegment
	var currentSegment *MediaSegment

	for i, w := range et.currentWords {
		if currentSegment == nil {
			currentSegment = &MediaSegment{
				SourcePath: "",
				StartTime:  w.StartTime,
				EndTime:    w.EndTime,
			}
		} else {
			if w.StartTime > currentSegment.EndTime+0.1 {
				segments = append(segments, *currentSegment)
				currentSegment = &MediaSegment{
					SourcePath: "",
					StartTime:  w.StartTime,
					EndTime:    w.EndTime,
				}
			} else {
				currentSegment.EndTime = w.EndTime
			}
		}

		if i == len(et.currentWords)-1 && currentSegment != nil {
			segments = append(segments, *currentSegment)
		}
	}

	return segments
}

func (et *EditTimeline) OperationCount() int {
	return len(et.operations)
}

func copyWords(words []WordData) []WordData {
	result := make([]WordData, len(words))
	copy(result, words)
	return result
}
