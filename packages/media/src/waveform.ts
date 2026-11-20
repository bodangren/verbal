import { MediaError } from "./import";

export type WaveformOptions = {
  width: number;
  height: number;
  color: string;
};

/** A strip wide enough to read, shallow enough to sit beside the video. */
export const DEFAULT_WAVEFORM: WaveformOptions = { width: 1200, height: 120, color: "white" };

const MIN_WIDTH = 64;
const MAX_WIDTH = 4096;
const MIN_HEIGHT = 16;
const MAX_HEIGHT = 512;

const HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const NAMED_COLOR = /^[a-z]{3,20}$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Validates and clamps waveform options.
 *
 * The size is clamped because the caller supplies it and an unbounded image is
 * an easy way to exhaust memory. The colour is validated because it is
 * interpolated into a filtergraph, where a stray separator would become a
 * second, unintended filter.
 */
export function normaliseWaveform(options: Partial<WaveformOptions> = {}): WaveformOptions {
  const width = options.width ?? DEFAULT_WAVEFORM.width;
  const height = options.height ?? DEFAULT_WAVEFORM.height;
  const color = options.color ?? DEFAULT_WAVEFORM.color;

  if (!HEX_COLOR.test(color) && !NAMED_COLOR.test(color)) {
    throw new MediaError("invalid-option", `invalid waveform colour: ${color}`);
  }

  return {
    width: Number.isFinite(width)
      ? Math.round(clamp(width, MIN_WIDTH, MAX_WIDTH))
      : DEFAULT_WAVEFORM.width,
    height: Number.isFinite(height)
      ? Math.round(clamp(height, MIN_HEIGHT, MAX_HEIGHT))
      : DEFAULT_WAVEFORM.height,
    color,
  };
}

/** Builds the argv that draws one waveform frame into `outputPath`. */
export function buildWaveformArgs(input: {
  inputPath: string;
  outputPath: string;
  options?: Partial<WaveformOptions>;
}): string[] {
  const { width, height, color } = normaliseWaveform(input.options);

  return [
    "-y",
    "-i",
    input.inputPath,
    "-filter_complex",
    `showwavespic=s=${width}x${height}:colors=${color}`,
    "-frames:v",
    "1",
    input.outputPath,
  ];
}
