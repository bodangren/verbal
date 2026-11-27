/**
 * Count the visible lines of the transcript.
 *
 * A word counts when its rectangle intersects the transcript rectangle and,
 * when given, the clip rectangle (the scrolling stage that shows it). A word
 * below the fold of a scrolling stage is not visible, so it does not count.
 * Visible words group into lines by their top coordinate.
 */

const LINE_TOLERANCE_PX = 2;

export function countVisibleTranscriptLines(wordRects, transcriptRect, clipRect) {
  const top =
    clipRect === undefined ? transcriptRect.top : Math.max(transcriptRect.top, clipRect.top);
  const bottom =
    clipRect === undefined
      ? transcriptRect.bottom
      : Math.min(transcriptRect.bottom, clipRect.bottom);
  const tops = wordRects
    .filter((rect) => rect.top < bottom && rect.bottom > top)
    .map((rect) => rect.top)
    .sort((a, b) => a - b);

  let lines = 0;
  let current = Number.NEGATIVE_INFINITY;
  for (const wordTop of tops) {
    if (wordTop - current > LINE_TOLERANCE_PX) {
      lines += 1;
      current = wordTop;
    }
  }
  return lines;
}
