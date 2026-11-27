/**
 * Typhoon ASR Realtime engine: FastConformer encoder + RNNT decoder/joint ONNX
 * sessions, greedy decode, and Thai word spans.
 *
 * Ported from the reference Python in `pythaiasr/typhoon.py`. Sessions are
 * injected so unit tests never load the 461 MB model; the real adapter is
 * `openOnnxSession`.
 */
import { extractFeatures } from "./typhoon-features";
import type { SpokenWord, TranscriptionResult } from "./types";

export type TensorType = "float32" | "int32" | "int64";
export type TensorData = Float32Array | Int32Array | BigInt64Array;

export type TensorValue = {
  type: TensorType;
  data: TensorData;
  dims: readonly number[];
};

export type SessionLike = {
  run(feeds: Readonly<Record<string, TensorValue>>): Promise<Record<string, TensorValue>>;
};

export type OpenSession = (modelPath: string) => Promise<SessionLike>;

const HIDDEN_DIM = 640;
const MAX_SYMBOLS_PER_STEP = 10;
export const SAMPLE_RATE = 16000;
/** FastConformer subsamples 8x: 160-hop mel frames become 1280-sample frames. */
export const FRAME_DURATION = 1280 / SAMPLE_RATE;

const SPECIAL_TOKENS = new Set(["<unk>", "<s>", "</s>", "<pad>", "<bos>", "<eos>"]);
const WORD_BOUNDARY = "\u2581";

/** Loads the real ONNX Runtime only when the provider is actually used. */
export async function openOnnxSession(modelPath: string): Promise<SessionLike> {
  const ort = await import("onnxruntime-node");
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
  });

  return {
    async run(feeds) {
      const input: Record<string, InstanceType<typeof ort.Tensor>> = {};
      for (const [name, value] of Object.entries(feeds)) {
        input[name] = new ort.Tensor(value.type, value.data, [...value.dims]);
      }

      const output = await session.run(input);
      const result: Record<string, TensorValue> = {};
      for (const [name, tensor] of Object.entries(output)) {
        result[name] = {
          type: tensor.type as TensorType,
          data: tensor.data as TensorData,
          dims: tensor.dims,
        };
      }
      return result;
    },
  };
}

/** Decodes vocabulary ids, dropping control tokens and turning ▁ into a space. */
export function decodeTokenIds(vocab: readonly string[], ids: readonly number[]): string {
  const pieces: string[] = [];
  for (const id of ids) {
    const token = vocab[id];
    if (token === undefined || SPECIAL_TOKENS.has(token)) {
      continue;
    }
    pieces.push(token);
  }
  return pieces.join("").replaceAll(WORD_BOUNDARY, " ").trim();
}

function tensorOf(result: Record<string, TensorValue>, name: string): TensorValue {
  const value = result[name];
  if (value === undefined) {
    throw new Error(`model output is missing "${name}"`);
  }
  return value;
}

function int64Of(result: Record<string, TensorValue>, name: string): number {
  const value = tensorOf(result, name);
  const first = value.data[0];
  if (first === undefined) {
    throw new Error(`model output "${name}" is empty`);
  }
  return Number(first);
}

export type GreedyDecodeOptions = {
  vocabSize: number;
  hiddenDim?: number;
  maxSymbolsPerStep?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export type GreedyDecodeResult = {
  tokenIds: number[];
  /** Encoder frame index for each emitted token. */
  timestamps: number[];
};

function argmax(values: Float32Array): number {
  let best = 0;
  let bestValue = values[0] ?? Number.NEGATIVE_INFINITY;
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i]!;
    if (value > bestValue) {
      bestValue = value;
      best = i;
    }
  }
  return best;
}

/**
 * Greedy RNNT decode over the encoder output.
 *
 * The blank id is the vocabulary size, as in the reference implementation:
 * the joint network has one extra output for blank.
 */
export async function greedyDecode(
  encoder: SessionLike,
  decoder: SessionLike,
  encoded: TensorValue,
  encodedFrames: number,
  options: GreedyDecodeOptions,
): Promise<GreedyDecodeResult> {
  const frames = encoded.dims[2];
  if (frames === undefined || frames < encodedFrames) {
    throw new Error(`encoder output has ${frames ?? 0} frames, expected ${encodedFrames}`);
  }

  const hidden = options.hiddenDim ?? HIDDEN_DIM;
  const maxSymbols = options.maxSymbolsPerStep ?? MAX_SYMBOLS_PER_STEP;
  const blankId = options.vocabSize;
  const channels = encoded.dims[1] ?? 0;

  // The RNNT decoder state starts fresh on every call. The windowed provider
  // transcribes each window in a separate call, so this reset is the window
  // boundary by design, not a bug.
  const h = new Float32Array(hidden);
  const c = new Float32Array(hidden);
  let lastToken = blankId;

  const tokenIds: number[] = [];
  const timestamps: number[] = [];
  const data = encoded.data as Float32Array;
  const frame = new Float32Array(channels);

  for (let t = 0; t < encodedFrames; t += 1) {
    if (options.signal?.aborted === true) {
      throw new Error("transcription cancelled");
    }

    for (let ch = 0; ch < channels; ch += 1) {
      frame[ch] = data[ch * frames + t]!;
    }

    let symbols = 0;
    while (symbols < maxSymbols) {
      const output = await decoder.run({
        encoder_outputs: { type: "float32", data: frame, dims: [1, channels, 1] },
        targets: { type: "int32", data: Int32Array.from([lastToken]), dims: [1, 1] },
        target_length: { type: "int32", data: Int32Array.from([1]), dims: [1] },
        input_states_1: { type: "float32", data: h, dims: [1, 1, hidden] },
        input_states_2: { type: "float32", data: c, dims: [1, 1, hidden] },
      });

      const logits = tensorOf(output, "outputs");
      const predicted = argmax(logits.data as Float32Array);
      if (predicted === blankId) {
        break;
      }

      tokenIds.push(predicted);
      timestamps.push(t);
      lastToken = predicted;

      const nextH = tensorOf(output, "output_states_1").data as Float32Array;
      const nextC = tensorOf(output, "output_states_2").data as Float32Array;
      h.set(nextH.subarray(0, hidden));
      c.set(nextC.subarray(0, hidden));
      symbols += 1;
    }

    options.onProgress?.((t + 1) / encodedFrames);
  }

  return { tokenIds, timestamps };
}

export type CharTime = { char: string; time: number };

/** One entry per emitted character, in decode order, for word alignment. */
export function characterTimes(
  vocab: readonly string[],
  tokenIds: readonly number[],
  timestamps: readonly number[],
): CharTime[] {
  const chars: CharTime[] = [];
  for (let i = 0; i < tokenIds.length; i += 1) {
    const token = vocab[tokenIds[i]!];
    const time = timestamps[i];
    if (token === undefined || time === undefined || SPECIAL_TOKENS.has(token)) {
      continue;
    }
    for (const char of token.replaceAll(WORD_BOUNDARY, " ")) {
      chars.push({ char, time: time * FRAME_DURATION });
    }
  }
  return chars;
}

type Segment = { segment: string; isWordLike: boolean };

function segmentThai(text: string): Segment[] {
  const Segmenter = (Intl as { Segmenter?: new (locale: string, options: { granularity: "word" }) => { segment(input: string): Iterable<Segment> } }).Segmenter;
  if (Segmenter === undefined) {
    return text
      .split(/\s+/)
      .filter((word) => word !== "")
      .map((word) => ({ segment: word, isWordLike: true }));
  }

  const segmenter = new Segmenter("th", { granularity: "word" });
  return [...segmenter.segment(text)];
}

/**
 * Turns emitted tokens into word-level spans.
 *
 * Typhoon emits sub-word tokens with 0.08 s frame times. Thai has no spaces,
 * so `Intl.Segmenter("th")` supplies the word boundaries; each word takes the
 * time of its first and last matched character. Boundaries are approximate but
 * monotonic, which is what the transcript editor and cut list need.
 */
export function wordsFromTokens(
  vocab: readonly string[],
  tokenIds: readonly number[],
  timestamps: readonly number[],
): SpokenWord[] {
  const text = decodeTokenIds(vocab, tokenIds);
  if (text === "") {
    return [];
  }

  const chars = characterTimes(vocab, tokenIds, timestamps);
  const words: SpokenWord[] = [];
  let cursor = 0;
  let previousEnd = 0;

  for (const segment of segmentThai(text)) {
    if (!segment.isWordLike) {
      continue;
    }

    const wordChars = [...segment.segment].filter((char) => char.trim() !== "");
    if (wordChars.length === 0) {
      continue;
    }

    let start: number | undefined;
    let end: number | undefined;

    for (const char of wordChars) {
      let found = -1;
      for (let i = cursor; i < chars.length; i += 1) {
        if (chars[i]!.char === char) {
          found = i;
          break;
        }
      }
      if (found === -1) {
        continue;
      }
      const time = chars[found]!.time;
      start ??= time;
      end = time + FRAME_DURATION;
      cursor = found + 1;
    }

    if (start === undefined || end === undefined) {
      continue;
    }

    const clampedStart = Math.max(start, previousEnd);
    const clampedEnd = Math.max(end, clampedStart + FRAME_DURATION);
    words.push({ text: segment.segment, start: round(clampedStart), end: round(clampedEnd) });
    previousEnd = clampedEnd;
  }

  if (words.length === 0) {
    // No usable segmentation: fall back to one span per token.
    let fallbackStart = 0;
    for (const entry of chars) {
      if (entry.char.trim() === "") {
        continue;
      }
      const end = entry.time + FRAME_DURATION;
      words.push({ text: entry.char, start: round(entry.time), end: round(end) });
      fallbackStart = end;
    }
    if (fallbackStart === 0 && words.length === 0) {
      return [];
    }
  }

  return words;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export type TyphoonEngineConfig = {
  encoderPath: string;
  decoderPath: string;
  vocab: readonly string[];
  openSession?: OpenSession;
  maxSymbolsPerStep?: number;
};

export type TyphoonEngine = {
  transcribe(
    audio: Float32Array,
    options?: { onProgress?: (fraction: number) => void; signal?: AbortSignal },
  ): Promise<TranscriptionResult>;
};

/**
 * Builds the engine. Sessions open lazily on the first call, so constructing a
 * provider is cheap and a missing model fails at transcription time with a
 * clear message rather than at import time.
 */
export function createTyphoonEngine(config: TyphoonEngineConfig): TyphoonEngine {
  const openSession = config.openSession ?? openOnnxSession;
  let sessions: Promise<{ encoder: SessionLike; decoder: SessionLike }> | undefined;

  const ensureSessions = () => {
    sessions ??= Promise.all([
      openSession(config.encoderPath),
      openSession(config.decoderPath),
    ]).then(([encoder, decoder]) => ({ encoder, decoder }));
    return sessions;
  };

  return {
    async transcribe(audio, options = {}) {
      if (config.vocab.length === 0) {
        throw new Error("the Typhoon vocabulary is empty");
      }
      if (audio.length === 0) {
        throw new Error("the extracted audio is empty");
      }

      options.signal?.throwIfAborted();
      const features = extractFeatures(audio);
      options.signal?.throwIfAborted();
      const { encoder, decoder } = await ensureSessions();

      const encoderOutput = await encoder.run({
        audio_signal: {
          type: "float32",
          data: features.data,
          dims: [1, features.nMels, features.paddedFrames],
        },
        length: {
          type: "int64",
          data: BigInt64Array.from([BigInt(features.frames)]),
          dims: [1],
        },
      });

      const encoded = tensorOf(encoderOutput, "outputs");
      const encodedFrames = int64Of(encoderOutput, "encoded_lengths");

      const decoded = await greedyDecode(encoder, decoder, encoded, encodedFrames, {
        vocabSize: config.vocab.length,
        maxSymbolsPerStep: config.maxSymbolsPerStep,
        onProgress: options.onProgress,
        signal: options.signal,
      });

      const words = wordsFromTokens(config.vocab, decoded.tokenIds, decoded.timestamps);
      const text = decodeTokenIds(config.vocab, decoded.tokenIds);

      return { text, language: "th", words };
    },
  };
}
