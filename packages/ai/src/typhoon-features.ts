/**
 * NeMo FastConformer log-mel frontend, ported from the reference Python in
 * `pythaiasr/typhoon.py`.
 *
 * The model was exported from NeMo, so the features must match its
 * preprocessing exactly: pre-emphasis, a reflect-padded 512-point STFT with a
 * 400-sample non-periodic Hann window, a Slaney-normalised 80-bin mel bank,
 * log compression, per-bin normalisation over time, and zero-padding the time
 * axis to a multiple of 16. Everything here is pure; the fixture in
 * `testdata/typhoon/features-sine.f32` pins the output to the Python values.
 */

export type FeatureOptions = {
  sampleRate?: number;
  nMels?: number;
  nFft?: number;
  winLength?: number;
  hopLength?: number;
  preEmphasis?: number;
  padTo?: number;
};

export type Features = {
  /** Row-major [nMels][paddedFrames], ready for an ONNX [1, nMels, T] tensor. */
  data: Float32Array;
  nMels: number;
  /** Frames before zero-padding; the encoder length argument. */
  frames: number;
  paddedFrames: number;
  sampleRate: number;
};

const DEFAULTS = {
  sampleRate: 16000,
  nMels: 80,
  nFft: 512,
  winLength: 400,
  hopLength: 160,
  preEmphasis: 0.97,
  padTo: 16,
} as const;

/** Slaney's auditory mel scale, as used by librosa's default filter bank. */
export function hzToMelSlaney(hz: number): number {
  const fSp = 200.0 / 3.0;
  const minLogHz = 1000.0;
  const minLogMel = minLogHz / fSp;
  const logStep = Math.log(6.4) / 27.0;

  return hz >= minLogHz ? minLogMel + Math.log(hz / minLogHz) / logStep : hz / fSp;
}

export function melToHzSlaney(mel: number): number {
  const fSp = 200.0 / 3.0;
  const minLogHz = 1000.0;
  const minLogMel = minLogHz / fSp;
  const logStep = Math.log(6.4) / 27.0;

  return mel >= minLogMel ? minLogHz * Math.exp(logStep * (mel - minLogMel)) : fSp * mel;
}

/**
 * Builds the mel bank exactly as the Python fallback does: triangular filters in
 * mel space, each scaled to area 2 / (f[i+2] - f[i]).
 */
export function createMelFilterbank(options: FeatureOptions = {}): Float32Array {
  const sampleRate = options.sampleRate ?? DEFAULTS.sampleRate;
  const nMels = options.nMels ?? DEFAULTS.nMels;
  const nFft = options.nFft ?? DEFAULTS.nFft;
  const fmin = 0;
  const fmax = sampleRate / 2;
  const bins = nFft / 2 + 1;

  const melMin = hzToMelSlaney(fmin);
  const melMax = hzToMelSlaney(fmax);
  const hzPoints = new Float64Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i += 1) {
    const mel = melMin + ((melMax - melMin) * i) / (nMels + 1);
    hzPoints[i] = melToHzSlaney(mel);
  }

  const fftFreqs = new Float64Array(bins);
  for (let i = 0; i < bins; i += 1) {
    fftFreqs[i] = (sampleRate / 2) * (i / (bins - 1));
  }

  const weights = new Float32Array(nMels * bins);
  for (let m = 0; m < nMels; m += 1) {
    const lowerHz = hzPoints[m]!;
    const centreHz = hzPoints[m + 1]!;
    const upperHz = hzPoints[m + 2]!;
    const lowerWidth = centreHz - lowerHz;
    const upperWidth = upperHz - centreHz;
    const enorm = 2 / (hzPoints[m + 2]! - hzPoints[m]!);

    for (let b = 0; b < bins; b += 1) {
      const freq = fftFreqs[b]!;
      const rising = (freq - lowerHz) / lowerWidth;
      const falling = (upperHz - freq) / upperWidth;
      const weight = Math.max(0, Math.min(rising, falling)) * enorm;
      weights[m * bins + b] = weight;
    }
  }

  return weights;
}

function assertPowerOfTwo(value: number, label: string): void {
  if (value <= 0 || (value & (value - 1)) !== 0) {
    throw new Error(`${label} must be a power of two, got ${value}`);
  }
}

/** In-place iterative radix-2 FFT with bit-reversal. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;

  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angle = (-2 * Math.PI) / size;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);

    for (let start = 0; start < n; start += size) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k += 1) {
        const a = start + k;
        const b = a + half;
        const tRe = curRe * re[b]! - curIm * im[b]!;
        const tIm = curRe * im[b]! + curIm * re[b]!;
        re[b] = re[a]! - tRe;
        im[b] = im[a]! - tIm;
        re[a] = re[a]! + tRe;
        im[a] = im[a]! + tIm;
        const nextRe = curRe * stepRe - curIm * stepIm;
        curIm = curRe * stepIm + curIm * stepRe;
        curRe = nextRe;
      }
    }
  }
}

function hannWindow(length: number): Float64Array {
  const window = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }
  return window;
}

function paddedWindow(nFft: number, winLength: number): Float64Array {
  const window = new Float64Array(nFft);
  const start = (nFft - winLength) >> 1;
  window.set(hannWindow(winLength), start);
  return window;
}

/** NumPy `mode="reflect"` for a pad smaller than the signal. */
function reflectPad(signal: Float32Array, pad: number): Float32Array {
  if (pad === 0) {
    return signal;
  }
  if (signal.length <= pad) {
    // NumPy requires pad < length for reflect; the reference reaches this only
    // for audio shorter than half an FFT, which it first zero-extends.
    throw new Error(`cannot reflect-pad ${pad} samples into ${signal.length}`);
  }

  const out = new Float32Array(signal.length + 2 * pad);
  for (let i = 0; i < pad; i += 1) {
    out[i] = signal[pad - i]!;
    out[pad + signal.length + i] = signal[signal.length - 2 - i]!;
  }
  out.set(signal, pad);
  return out;
}

function prepareSignal(audio: Float32Array, pad: number): Float32Array {
  if (audio.length >= pad) {
    return reflectPad(audio, pad);
  }

  const extended = new Float32Array(pad);
  extended.set(audio);
  return reflectPad(extended, pad);
}

function preEmphasise(audio: Float32Array, coefficient: number): Float32Array {
  if (coefficient <= 0) {
    return audio;
  }

  const out = new Float32Array(audio.length);
  if (audio.length > 0) {
    out[0] = audio[0]!;
  }
  for (let i = 1; i < audio.length; i += 1) {
    out[i] = audio[i]! - coefficient * audio[i - 1]!;
  }
  return out;
}

export function extractFeatures(audio: Float32Array, options: FeatureOptions = {}): Features {
  const sampleRate = options.sampleRate ?? DEFAULTS.sampleRate;
  const nMels = options.nMels ?? DEFAULTS.nMels;
  const nFft = options.nFft ?? DEFAULTS.nFft;
  const winLength = options.winLength ?? DEFAULTS.winLength;
  const hopLength = options.hopLength ?? DEFAULTS.hopLength;
  const preEmphasis = options.preEmphasis ?? DEFAULTS.preEmphasis;
  const padTo = options.padTo ?? DEFAULTS.padTo;

  assertPowerOfTwo(nFft, "nFft");
  if (winLength > nFft) {
    throw new Error(`winLength (${winLength}) must not exceed nFft (${nFft})`);
  }
  if (audio.length === 0) {
    throw new Error("audio is empty");
  }

  const signal = prepareSignal(preEmphasise(audio, preEmphasis), nFft >> 1);
  const window = paddedWindow(nFft, winLength);
  const frames = Math.floor((signal.length - nFft) / hopLength) + 1;
  if (frames <= 0) {
    throw new Error("audio is too short for one STFT frame");
  }

  const bins = nFft / 2 + 1;
  const melBank = createMelFilterbank({ sampleRate, nMels, nFft });
  const logMel = new Float64Array(nMels * frames);

  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  const power = new Float64Array(bins);

  for (let frame = 0; frame < frames; frame += 1) {
    const offset = frame * hopLength;
    for (let i = 0; i < nFft; i += 1) {
      re[i] = signal[offset + i]! * window[i]!;
      im[i] = 0;
    }
    fft(re, im);

    for (let b = 0; b < bins; b += 1) {
      power[b] = re[b]! * re[b]! + im[b]! * im[b]!;
    }

    for (let m = 0; m < nMels; m += 1) {
      let sum = 0;
      const row = m * bins;
      for (let b = 0; b < bins; b += 1) {
        sum += melBank[row + b]! * power[b]!;
      }
      logMel[m * frames + frame] = Math.log(sum + 2 ** -24);
    }
  }

  // Per-mel-bin mean and standard deviation over time.
  const normalised = new Float64Array(nMels * frames);
  for (let m = 0; m < nMels; m += 1) {
    const row = m * frames;
    let mean = 0;
    for (let t = 0; t < frames; t += 1) {
      mean += logMel[row + t]!;
    }
    mean /= frames;

    let variance = 0;
    for (let t = 0; t < frames; t += 1) {
      const delta = logMel[row + t]! - mean;
      variance += delta * delta;
    }
    const std = Math.sqrt(variance / frames);
    const denominator = std + 1e-5;

    for (let t = 0; t < frames; t += 1) {
      normalised[row + t] = (logMel[row + t]! - mean) / denominator;
    }
  }

  const paddedFrames = padTo > 0 ? Math.ceil(frames / padTo) * padTo : frames;
  const data = new Float32Array(nMels * paddedFrames);
  for (let m = 0; m < nMels; m += 1) {
    data.set(normalised.subarray(m * frames, (m + 1) * frames), m * paddedFrames);
  }

  return { data, nMels, frames, paddedFrames, sampleRate };
}
