import { describe, expect, it } from "vitest";
import {
  decodeTokenIds,
  greedyDecode,
  wordsFromTokens,
  type SessionLike,
  type TensorValue,
} from "./typhoon-engine";

const VOCAB = ["<unk>", "<s>", "</s>", "<pad>", "<bos>", "<eos>", "สวัสดี", "ครับ", "▁", "ภาษา", "ไทย"];

function logits(winner: number, size: number): Float32Array {
  const values = new Float32Array(size).fill(-1);
  values[winner] = 1;
  return values;
}

function tensor(type: TensorValue["type"], data: TensorValue["data"], dims: number[]): TensorValue {
  return { type, data, dims };
}

describe("decodeTokenIds", () => {
  it("drops control tokens and turns the word boundary into a space", () => {
    expect(decodeTokenIds(VOCAB, [1, 6, 7, 8, 9, 10, 2])).toBe("สวัสดีครับ ภาษาไทย");
  });

  it("ignores unknown ids", () => {
    expect(decodeTokenIds(VOCAB, [99, 6])).toBe("สวัสดี");
  });
});

describe("greedyDecode", () => {
  it("emits tokens until blank and carries the model state forward", async () => {
    const emits = [1, 2, 4]; // token 1, token 2, then blank for frame 0
    let call = 0;

    const decoder: SessionLike = {
      async run() {
        const winner = emits[call] ?? 4;
        call += 1;
        return {
          outputs: tensor("float32", logits(winner, 5), [1, 1, 1, 5]),
          output_states_1: tensor("float32", new Float32Array(640), [1, 1, 640]),
          output_states_2: tensor("float32", new Float32Array(640), [1, 1, 640]),
        };
      },
    };

    const encoder: SessionLike = {
      async run(feeds) {
        expect(feeds.audio_signal?.dims).toEqual([1, 80, 112]);
        expect(feeds.length?.data).toEqual(BigInt64Array.from([BigInt(101)]));
        return {
          outputs: tensor("float32", new Float32Array(512 * 2), [1, 512, 2]),
          encoded_lengths: tensor("int64", BigInt64Array.from([BigInt(2)]), [1]),
        };
      },
    };

    const result = await greedyDecode(
      encoder,
      decoder,
      tensor("float32", new Float32Array(512 * 2), [1, 512, 2]),
      2,
      { vocabSize: 4 },
    );

    expect(result).toEqual({ tokenIds: [1, 2], timestamps: [0, 0] });
    // Frame 0: token, token, blank. Frame 1: blank.
    expect(call).toBe(4);
  });

  it("stops on abort", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      greedyDecode(
        { run: async () => ({}) },
        { run: async () => ({}) },
        tensor("float32", new Float32Array(512), [1, 512, 1]),
        1,
        { vocabSize: 4, signal: controller.signal },
      ),
    ).rejects.toThrow(/cancelled/);
  });
});

describe("wordsFromTokens", () => {
  it("splits Thai with Intl.Segmenter and keeps spans monotonic", () => {
    const vocab = ["<unk>", "<s>", "</s>", "<pad>", "<bos>", "<eos>", "สภาพ", "อากาศ", "▁", "อัน", "หนาว", "เย็น"];
    const ids = [6, 7, 8, 9, 10, 11];
    const timestamps = [0, 0, 4, 5, 6, 7];
    const words = wordsFromTokens(vocab, ids, timestamps);

    expect(words.length).toBeGreaterThanOrEqual(4);
    expect(words.map((word) => word.text).join("")).toContain("สภาพอากาศ");
    for (let i = 0; i < words.length; i += 1) {
      expect(words[i]!.end).toBeGreaterThan(words[i]!.start);
      if (i > 0) {
        expect(words[i]!.start).toBeGreaterThanOrEqual(words[i - 1]!.start);
      }
    }
    expect(words[words.length - 1]!.end).toBeLessThanOrEqual(8 * 0.08 + 0.001);
  });

  it("returns nothing for an empty decode", () => {
    expect(wordsFromTokens(VOCAB, [], [])).toEqual([]);
  });

  it("falls back to token spans when text cannot be segmented", () => {
    const vocab = ["<unk>", "<s>", "</s>", "<pad>", "<bos>", "<eos>", "abc"];
    const words = wordsFromTokens(vocab, [6], [3]);
    expect(words).toEqual([{ text: "abc", start: 0.24, end: 0.32 }]);
  });
});
