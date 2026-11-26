import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTyphoonProvider } from "./typhoon";

/**
 * Real-model check. Skipped unless the 461 MB Typhoon model is installed, so
 * `npm run check` stays fast and offline. Run it with:
 *
 *   VERBAL_TYPHOON_MODEL=/path/to/model npx vitest run packages/ai/src/typhoon.integration.test.ts
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL_DIR =
  process.env.VERBAL_TYPHOON_MODEL ??
  path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "verbal",
    "models",
    "typhoon-asr-realtime",
  );
const SAMPLE = path.join(HERE, "..", "testdata", "thai", "common-voice-th.wav");
const EXPECTED = "มันเป็นเรื่องที่ดีที่การเดินทางย้อนเวลาไม่ได้มีอยู่จริง";

const available = ["encoder.onnx", "decoder.onnx", "vocab.json"].every((name) =>
  existsSync(path.join(MODEL_DIR, name)),
);

describe.skipIf(!available)("Typhoon ASR with the real model", () => {
  it(
    "transcribes the Common Voice Thai sample with monotonic word spans",
    async () => {
      const provider = createTyphoonProvider({
        modelDir: MODEL_DIR,
        wavPathFor: () => path.join(os.tmpdir(), `verbal-typhoon-${process.pid}.wav`),
      });

      const result = await provider.transcribe({ filePath: SAMPLE });

      expect(result.language).toBe("th");
      expect(result.text.replace(/\s+/g, "")).toBe(EXPECTED);
      expect(result.words.length).toBeGreaterThan(0);

      let previousStart = -1;
      for (const word of result.words) {
        expect(word.text.trim()).not.toBe("");
        expect(word.start).toBeGreaterThanOrEqual(0);
        expect(word.end).toBeGreaterThan(word.start);
        expect(word.end).toBeLessThanOrEqual(5.2);
        expect(word.start).toBeGreaterThanOrEqual(previousStart);
        previousStart = word.start;
      }
    },
    120_000,
  );
});
