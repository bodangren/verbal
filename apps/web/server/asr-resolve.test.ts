import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAsr, type AsrResolveInput } from "./asr-resolve";

const DATA = path.join(path.sep, "data", "verbal");
const BINARY = path.join(DATA, "bin", "whisper-cli");
const MODELS = path.join(DATA, "models");
const MODEL = path.join(MODELS, "ggml-small.bin");
const TYPHOON_DIR = path.join(MODELS, "typhoon-asr-realtime");
const TYPHOON_FILES = ["encoder.onnx", "decoder.onnx", "vocab.json"].map((name) =>
  path.join(TYPHOON_DIR, name),
);

function input(overrides: Partial<AsrResolveInput> = {}): AsrResolveInput {
  return {
    dataDir: DATA,
    env: {},
    exists: (candidate) => candidate === BINARY || candidate === MODEL,
    list: (dir) => (dir === MODELS ? ["ggml-small.bin"] : []),
    onPath: () => false,
    ...overrides,
  };
}

describe("resolveAsr", () => {
  it("finds a local install with no environment variables", () => {
    expect(resolveAsr(input())).toEqual({
      mode: "local",
      binary: BINARY,
      modelPath: MODEL,
      modelName: "small",
      language: "auto",
    });
  });

  it("honours VERBAL_ASR_LANGUAGE", () => {
    expect(resolveAsr(input({ env: { VERBAL_ASR_LANGUAGE: "th" } }))).toMatchObject({
      mode: "local",
      language: "th",
    });
  });

  it("uses a whisper binary found on PATH when no local binary exists", () => {
    const resolved = resolveAsr(
      input({
        exists: (candidate) => candidate === MODEL,
        onPath: (name) => name === "whisper-cli",
      }),
    );

    expect(resolved).toMatchObject({ mode: "local", binary: "whisper-cli" });
  });

  it("prefers env overrides when the paths exist", () => {
    const resolved = resolveAsr(
      input({
        env: {
          VERBAL_WHISPER_BIN: "/custom/whisper-cli",
          VERBAL_WHISPER_MODEL: "/custom/ggml-medium.en.bin",
          VERBAL_ASR_LANGUAGE: "th",
        },
        exists: (candidate) =>
          candidate === "/custom/whisper-cli" || candidate === "/custom/ggml-medium.en.bin",
      }),
    );

    expect(resolved).toEqual({
      mode: "local",
      binary: "/custom/whisper-cli",
      modelPath: "/custom/ggml-medium.en.bin",
      modelName: "medium",
      language: "th",
    });
  });

  it("falls back when an env override does not exist", () => {
    expect(
      resolveAsr(
        input({ env: { VERBAL_WHISPER_BIN: "/missing/bin", VERBAL_WHISPER_MODEL: "/missing/model" } }),
      ),
    ).toMatchObject({ mode: "local", binary: BINARY, modelPath: MODEL });
  });

  it("chooses the best model by tier, then by name", () => {
    const cases: Array<[string[], string]> = [
      [
        ["ggml-base.bin", "ggml-small.bin", "ggml-medium.bin", "ggml-large-v3.bin"],
        "ggml-large-v3.bin",
      ],
      [["ggml-base.bin", "ggml-small.bin", "ggml-medium.bin"], "ggml-medium.bin"],
      [["ggml-base.bin", "ggml-small.en.bin"], "ggml-small.en.bin"],
      [["ggml-base.bin"], "ggml-base.bin"],
      [["ggml-instruct.bin"], "ggml-instruct.bin"],
    ];

    for (const [names, expected] of cases) {
      const resolved = resolveAsr(input({ list: (dir) => (dir === MODELS ? names : []) }));
      expect(resolved).toMatchObject({ mode: "local", modelPath: path.join(MODELS, expected) });
    }
  });

  it("ignores files that are not ggml models", () => {
    const resolved = resolveAsr(
      input({ list: (dir) => (dir === MODELS ? ["README.txt", "ggml-small.bin"] : []) }),
    );

    expect(resolved).toMatchObject({ mode: "local", modelName: "small" });
  });

  it("prefers a complete Typhoon model over whisper", () => {
    const resolved = resolveAsr(
      input({
        exists: (candidate) =>
          candidate === BINARY || candidate === MODEL || TYPHOON_FILES.includes(candidate),
      }),
    );

    expect(resolved).toEqual({ mode: "typhoon", modelDir: TYPHOON_DIR, language: "th" });
  });

  it("falls back to whisper when the Typhoon model is incomplete", () => {
    const resolved = resolveAsr(
      input({
        exists: (candidate) =>
          candidate === BINARY ||
          candidate === MODEL ||
          candidate === path.join(TYPHOON_DIR, "encoder.onnx"),
      }),
    );

    expect(resolved).toMatchObject({ mode: "local", modelName: "small" });
  });

  it("honours VERBAL_TYPHOON_MODEL", () => {
    const custom = path.join(path.sep, "custom", "typhoon");
    const resolved = resolveAsr(
      input({
        env: { VERBAL_TYPHOON_MODEL: custom },
        exists: (candidate) =>
          ["encoder.onnx", "decoder.onnx", "vocab.json"].some(
            (name) => candidate === path.join(custom, name),
          ),
      }),
    );

    expect(resolved).toEqual({ mode: "typhoon", modelDir: custom, language: "th" });
  });

  it("still lets VERBAL_ASR=cloud override a local Typhoon model", () => {
    const resolved = resolveAsr(
      input({
        env: { VERBAL_ASR: "cloud", OPENAI_API_KEY: "key" },
        exists: () => true,
      }),
    );

    expect(resolved).toEqual({ mode: "cloud" });
  });

  it("uses the cloud provider when VERBAL_ASR is cloud, even with a local install", () => {
    expect(resolveAsr(input({ env: { VERBAL_ASR: "cloud", OPENAI_API_KEY: "key" } }))).toEqual({
      mode: "cloud",
    });
  });

  it("uses the cloud provider when unset and no local install exists but a key is set", () => {
    const resolved = resolveAsr(
      input({
        env: { OPENAI_API_KEY: "key" },
        exists: () => false,
        list: () => [],
      }),
    );

    expect(resolved).toEqual({ mode: "cloud" });
  });

  it("reports both missing parts when unset and no key is set", () => {
    const resolved = resolveAsr(input({ exists: () => false, list: () => [] }));

    expect(resolved).toEqual({ mode: "none", missing: "both" });
  });

  it("reports a missing binary in explicit local mode", () => {
    const resolved = resolveAsr(
      input({ env: { VERBAL_ASR: "local" }, exists: (candidate) => candidate === MODEL }),
    );

    expect(resolved).toEqual({ mode: "none", missing: "binary" });
  });

  it("reports a missing model in explicit local mode, even with a key", () => {
    const resolved = resolveAsr(
      input({
        env: { VERBAL_ASR: "local", OPENAI_API_KEY: "key" },
        exists: (candidate) => candidate === BINARY,
        list: () => [],
      }),
    );

    expect(resolved).toEqual({ mode: "none", missing: "model" });
  });

  it("does not fall back to cloud in explicit local mode", () => {
    const resolved = resolveAsr(
      input({
        env: { VERBAL_ASR: "local", OPENAI_API_KEY: "key" },
        exists: () => false,
        list: () => [],
      }),
    );

    expect(resolved).toEqual({ mode: "none", missing: "both" });
  });
});
