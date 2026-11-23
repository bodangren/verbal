export type Beat = {
  /** Stable within one script revision. */
  id: string;
  index: number;
  text: string;
  wordCount: number;
};

/** Words in `text`, ignoring whitespace-only input. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Splits a script into sentence or line beats.
 *
 * A sentence ends after `.`, `!`, or `?` and whitespace. A newline is always a
 * beat boundary, so a script written one line per thought keeps those lines.
 * Common abbreviations ("Mr. Smith") will split; the script editor can join
 * them with a line break if needed.
 */
export function splitBeats(text: string): Beat[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (normalized === "") {
    return [];
  }

  const beats: Beat[] = [];
  for (const part of normalized.split(/(?<=[.!?])\s+|\n+/)) {
    const trimmed = part.trim();
    const wordCount = countWords(trimmed);
    if (wordCount === 0) {
      continue;
    }
    beats.push({
      id: `b${beats.length}`,
      index: beats.length,
      text: trimmed,
      wordCount,
    });
  }
  return beats;
}

/** Seconds to read `words` at `wpm`, rounded up. */
export function readTimeSeconds(words: number, wpm = 150): number {
  if (!Number.isFinite(words) || words <= 0) {
    return 0;
  }
  const safeWpm = Number.isFinite(wpm) && wpm > 0 ? wpm : 150;
  return Math.ceil((words / safeWpm) * 60);
}

/** Seconds as m:ss. */
export function formatReadTime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
