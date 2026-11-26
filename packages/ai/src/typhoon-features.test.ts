import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createMelFilterbank,
  extractFeatures,
  hzToMelSlaney,
  melToHzSlaney,
} from "./typhoon-features";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "..", "testdata", "typhoon");

type FixtureMeta = {
  sampleRate: number;
  seconds: number;
  shape: number[];
  sequenceFrames: number;
};

function readFixture(): { meta: FixtureMeta; features: Float32Array } {
  const meta = JSON.parse(readFileSync(path.join(FIXTURE, "features-sine.json"), "utf8")) as FixtureMeta;
  const bytes = readFileSync(path.join(FIXTURE, "features-sine.f32"));
  const features = new Float32Array(bytes.length / 4);
  for (let i = 0; i < features.length; i += 1) {
    features[i] = bytes.readFloatLE(i * 4);
  }
  return { meta, features };
}

/** The exact signal the Python fixture was generated from. */
function fixtureSignal(sampleRate: number, seconds: number): Float32Array {
  const samples = Math.round(sampleRate * seconds);
  const signal = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    signal[i] = 0.5 * Math.sin(2 * Math.PI * 440 * t) + 0.2 * Math.sin(2 * Math.PI * 1000 * t);
  }
  return signal;
}

describe("typhoon features", () => {
  it("matches the Python reference on the sine fixture", () => {
    const { meta, features: reference } = readFixture();
    const result = extractFeatures(fixtureSignal(meta.sampleRate, meta.seconds));

    expect([result.nMels, result.paddedFrames]).toEqual([meta.shape[1], meta.shape[2]]);
    expect(result.frames).toBe(meta.sequenceFrames);
    expect(result.data.length).toBe(reference.length);

    let maxDiff = 0;
    let worst = -1;
    for (let i = 0; i < reference.length; i += 1) {
      const diff = Math.abs(result.data[i]! - reference[i]!);
      if (diff > maxDiff) {
        maxDiff = diff;
        worst = i;
      }
    }

    expect(maxDiff, `worst index ${worst}: ${result.data[worst]} vs ${reference[worst]}`).toBeLessThan(2e-4);
  });

  it("keeps the time axis padded with zeros", () => {
    const result = extractFeatures(fixtureSignal(16000, 1));
    const padding = result.paddedFrames - result.frames;

    expect(padding).toBeGreaterThan(0);
    for (let m = 0; m < result.nMels; m += 1) {
      for (let t = result.frames; t < result.paddedFrames; t += 1) {
        expect(result.data[m * result.paddedFrames + t]).toBe(0);
      }
    }
  });

  it("builds a non-negative Slaney mel bank of the expected shape", () => {
    const bank = createMelFilterbank();
    const bins = 257;

    expect(bank.length).toBe(80 * bins);
    let total = 0;
    for (const weight of bank) {
      expect(weight).toBeGreaterThanOrEqual(0);
      total += weight;
    }
    expect(total).toBeGreaterThan(0);
    // The first filter starts at 0 Hz, so its DC weight is zero but the rest is not.
    expect(bank[0]).toBe(0);
    expect(bank.slice(0, bins).some((weight) => weight > 0)).toBe(true);
    // Every filter above the first ignores DC.
    expect(bank[bins]).toBe(0);
  });

  it("round-trips the Slaney scale", () => {
    for (const hz of [0, 100, 1000, 4000, 8000]) {
      expect(melToHzSlaney(hzToMelSlaney(hz))).toBeCloseTo(hz, 6);
    }
  });

  it("refuses an empty signal", () => {
    expect(() => extractFeatures(new Float32Array(0))).toThrow(/empty/);
  });
});
