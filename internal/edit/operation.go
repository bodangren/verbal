package edit

import "fmt"

type OperationType string

const (
	OperationDelete        OperationType = "delete"
	OperationReorder      OperationType = "reorder"
	OperationInsertSilence OperationType = "insert_silence"
	OperationSplit        OperationType = "split"
)

type Operation interface {
	Apply(words []WordData) ([]WordData, error)
	Undo(words []WordData) ([]WordData, error)
	MarshalJSON() ([]byte, error)
	Type() OperationType
	String() string
}

type WordData struct {
	Text      string  `json:"text"`
	StartTime float64 `json:"start_time"`
	EndTime   float64 `json:"end_time"`
	Index     int     `json:"index"`
}

func NewWordData(text string, startTime, endTime float64, index int) WordData {
	return WordData{
		Text:      text,
		StartTime: startTime,
		EndTime:   endTime,
		Index:     index,
	}
}

func (w WordData) Duration() float64 {
	return w.EndTime - w.StartTime
}

var ErrNotImplemented = fmt.Errorf("operation undo not yet implemented")

var ErrInvalidRange = fmt.Errorf("invalid delete range: from must be >= 0, to must be <= len(words), and from < to")