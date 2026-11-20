export type RGB = {
  r: number;
  g: number;
  b: number;
};

export type KeyQualityLevel = "good" | "warning" | "poor";

export type KeyQuality = {
  level: KeyQualityLevel;
  message: string;
  /** How much green dominates the other channels, 0..1. */
  greenDominance: number;
  /** 1 = perfectly even background, 0 = wildly uneven. */
  uniformity: number;
};

const PRECISION = 1000;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

/**
 * Judges how clean a chroma-key background looks from sampled pixels.
 *
 * Pure and display-free: the browser samples a canvas frame and hands the
 * pixels here, which keeps the heuristic testable without a camera.
 */
export function assessKeyQuality(samples: readonly RGB[]): KeyQuality {
  if (samples.length === 0) {
    return {
      level: "poor",
      message: "No preview samples to assess",
      greenDominance: 0,
      uniformity: 0,
    };
  }

  const dominance = samples.map(
    (sample) => (sample.g - Math.max(sample.r, sample.b)) / 255,
  );
  const mean = dominance.reduce((sum, value) => sum + value, 0) / dominance.length;
  const variance =
    dominance.reduce((sum, value) => sum + (value - mean) ** 2, 0) / dominance.length;
  const uniformity = Math.max(0, 1 - Math.sqrt(variance) * 6);

  const base = { greenDominance: round(mean), uniformity: round(uniformity) };

  if (mean < 0.15) {
    return {
      level: "poor",
      message: "Background is not green enough for a clean key",
      ...base,
    };
  }

  if (uniformity < 0.6) {
    return {
      level: "warning",
      message: "Uneven lighting or spill on the background",
      ...base,
    };
  }

  return { level: "good", message: "Key background looks clean", ...base };
}
