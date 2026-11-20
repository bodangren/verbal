/** Where a click on the waveform lands, in seconds. */
export function timeFromClick(input: {
  /** Click position in viewport coordinates. */
  clientX: number;
  /** The waveform element's left edge in viewport coordinates. */
  left: number;
  width: number;
  durationSeconds: number;
}): number {
  const { clientX, left, width, durationSeconds } = input;

  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }

  const offset = Math.min(Math.max(clientX - left, 0), width);
  return (offset / width) * durationSeconds;
}

/** The click position as a 0..1 fraction, which is what a marker needs. */
export function fractionFromClick(input: {
  clientX: number;
  left: number;
  width: number;
}): number {
  const { clientX, left, width } = input;

  if (!Number.isFinite(width) || width <= 0) {
    return 0;
  }

  return Math.min(Math.max(clientX - left, 0), width) / width;
}
