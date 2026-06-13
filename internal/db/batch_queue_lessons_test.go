package db

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// Red-phase artifact test for the Batch Transcription Queue Phase 4
// "Update lessons-learned.md" deliverable. See
// measure/tracks/batch_transcription_queue_20260509/test-strategy.md §7
// (artifact/contract tests are allowed when the phase deliverable is the
// artifact) and plan.md §Phase 4 Red notes (live-behavior proof: the test
// reads the file at runtime; the plan note records that JR owns the actual
// prose content during Green/closeout).
//
// The Green-phase author must append a section to
// measure/lessons-learned.md that documents the batch transcription queue
// track. This test pins only the structural anchor and the must-have
// keywords; the prose is JR's choice.

// readLessonsLearned returns the contents of measure/lessons-learned.md,
// resolved relative to the test's working directory. The test is
// run from the package directory (internal/db/), so the file lives at
// ../../measure/lessons-learned.md.
func readLessonsLearned(t *testing.T) []byte {
	t.Helper()
	pkgDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("os.Getwd: %v", err)
	}
	path := filepath.Clean(filepath.Join(pkgDir, "..", "..", "measure", "lessons-learned.md"))
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%q): %v", path, err)
	}
	return content
}

// TestBatchQueueLessonsLearned_HasTrackSection requires a markdown
// heading (level 2 or deeper) whose text mentions the batch
// transcription queue. The exact heading text is the Green author's
// choice. At HEAD the file has no such heading, so the test fails Red.
func TestBatchQueueLessonsLearned_HasTrackSection(t *testing.T) {
	text := string(readLessonsLearned(t))

	heading := regexp.MustCompile(`(?m)^#{2,}\s+[^\n]*[Bb]atch\s+[Tt]ranscription\s+[Qq]ueue`)
	if !heading.MatchString(text) {
		t.Fatalf("lessons-learned.md is missing a markdown heading about the batch transcription queue track")
	}
}

// TestBatchQueueLessonsLearned_DocumentsKeyLessons requires the file to
// contain the track-specific lesson keywords (case-insensitive
// substring match):
//
//   - "reconcile" — the processing→pending invariant enforced on runner
//     entry (test-strategy §4, plan §Phase 2 Green notes). This
//     keyword is track-specific: the existing lessons-learned.md
//     does not mention it.
//   - "queue" — ties the section to the queue model that did not
//     exist before this track. The existing file does not use
//     "queue" in any of its bullet points.
//
// At HEAD the file contains neither keyword, so the test fails Red.
// JR will append a section mentioning both to flip it green.
func TestBatchQueueLessonsLearned_DocumentsKeyLessons(t *testing.T) {
	text := strings.ToLower(string(readLessonsLearned(t)))

	required := []string{"reconcile", "queue"}
	for _, needle := range required {
		if !strings.Contains(text, needle) {
			t.Errorf("lessons-learned.md missing batch-queue lesson keyword: %q", needle)
		}
	}
}
