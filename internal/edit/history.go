package edit

import (
	"sync"
)

type EditHistory struct {
	operations []Operation
	undoStack  []Operation
	mu         sync.Mutex
}

func NewEditHistory() *EditHistory {
	return &EditHistory{
		operations: make([]Operation, 0),
		undoStack:  make([]Operation, 0),
	}
}

func (h *EditHistory) Apply(op Operation, words []WordData) ([]WordData, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	result, err := op.Apply(words)
	if err != nil {
		return nil, err
	}

	h.operations = append(h.operations, op)
	h.undoStack = make([]Operation, 0)

	return result, nil
}

func (h *EditHistory) Undo(words []WordData) ([]WordData, Operation, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if len(h.operations) == 0 {
		return words, nil, nil
	}

	lastOp := h.operations[len(h.operations)-1]
	h.operations = h.operations[:len(h.operations)-1]

	result, err := lastOp.Undo(words)
	if err != nil {
		return nil, nil, err
	}

	h.undoStack = append(h.undoStack, lastOp)

	return result, lastOp, nil
}

func (h *EditHistory) Redo(words []WordData) ([]WordData, Operation, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if len(h.undoStack) == 0 {
		return words, nil, nil
	}

	lastUndone := h.undoStack[len(h.undoStack)-1]
	h.undoStack = h.undoStack[:len(h.undoStack)-1]

	result, err := lastUndone.Apply(words)
	if err != nil {
		return nil, nil, err
	}

	h.operations = append(h.operations, lastUndone)

	return result, lastUndone, nil
}

func (h *EditHistory) CanUndo() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.operations) > 0
}

func (h *EditHistory) CanRedo() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.undoStack) > 0
}

func (h *EditHistory) OperationCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.operations)
}
