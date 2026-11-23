export const DEFAULT_WPM = 150;
export const WPM_STEP = 10;
export const FONT_STEP = 4;
export const MIN_WPM = 60;
export const MAX_WPM = 300;
export const MIN_FONT = 24;
export const MAX_FONT = 96;
export const DEFAULT_FONT = 40;
/** Approximate words per visual line in the prompter. */
export const WORDS_PER_LINE = 8;
export const LINE_HEIGHT_EM = 1.4;

export function wordsPerSecond(wpm: number): number {
  if (!Number.isFinite(wpm) || wpm <= 0) {
    return 0;
  }
  return wpm / 60;
}

/** Advances a word offset by `seconds` at `wpm`; negative time does nothing. */
export function advanceWords(
  startWords: number,
  wpm: number,
  seconds: number,
): number {
  const start = Number.isFinite(startWords) && startWords > 0 ? startWords : 0;
  const elapsed = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  return start + wordsPerSecond(wpm) * elapsed;
}

export function lineForWord(offsetWords: number, wordsPerLine: number): number {
  if (!Number.isFinite(offsetWords) || offsetWords <= 0) {
    return 0;
  }
  if (!Number.isFinite(wordsPerLine) || wordsPerLine <= 0) {
    return 0;
  }
  return Math.floor(offsetWords / wordsPerLine);
}

export function clampWpm(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WPM;
  }
  return Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(value)));
}

export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_FONT;
  }
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(value)));
}

/** Pixels to translate the prompter for a word offset. */
export function offsetPixels(
  offsetWords: number,
  fontSize: number,
  wordsPerLine = WORDS_PER_LINE,
): number {
  return lineForWord(offsetWords, wordsPerLine) * clampFontSize(fontSize) * LINE_HEIGHT_EM;
}
