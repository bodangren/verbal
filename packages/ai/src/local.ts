import { execFile } from "node:child_process";
import { promises as nodeFs } from "node:fs";
import { promisify } from "node:util";
import { AiError, type TranscriptionProvider, type TranscriptionResult } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses the word-level JSON a whisper-class CLI writes.
 *
 * Offsets are milliseconds in that format and seconds everywhere else in the
 * app, so the conversion happens once, here. An entry with unusable offsets
 * fails loudly instead of silently producing a word at zero seconds: a timing
 * that is wrong is worse than an error, because every later cut depends on it.
 */
export function parseWhisperJson(raw: string): TranscriptionResult {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new AiError("invalid-response", "whisper output is not valid JSON");
  }

  if (!isRecord(value) || !Array.isArray(value.transcription)) {
    throw new AiError("invalid-response", "whisper output has no transcription array");
  }

  const words: TranscriptionResult["words"] = [];

  for (const entry of value.transcription) {
    if (!isRecord(entry)) {
      throw new AiError("invalid-response", "transcription entry is not an object");
    }

    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (text === "") {
      continue;
    }

    const offsets = isRecord(entry.offsets) ? entry.offsets : null;
    const from = typeof offsets?.from === "number" ? offsets.from : Number.NaN;
    const to = typeof offsets?.to === "number" ? offsets.to : Number.NaN;

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      throw new AiError("invalid-response", `word "${text}" has invalid offsets`);
    }

    words.push({ text, start: from / 1000, end: to / 1000 });
  }

  const language =
    isRecord(value.result) && typeof value.result.language === "string"
      ? value.result.language
      : null;

  return { text: words.map((word) => word.text).join(" "), language, words };
}

/** Runs a command with an argv array; injected so tests need no binary. */
export type LocalRunner = (
  binary: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

export type LocalWhisperConfig = {
  /** Path to the model file the CLI loads. */
  modelPath: string;
  binary?: string;
  run?: LocalRunner;
  /** Reads the JSON the CLI wrote for a given output stem. */
  readOutput?: (stem: string) => Promise<string>;
  /** Where the CLI should write its JSON, given the media path. */
  stemFor?: (filePath: string) => string;
};

/** The CLI invocation, as an argv array; no value is ever shell-interpolated. */
export function buildLocalArgs(input: {
  modelPath: string;
  filePath: string;
  outputStem: string;
}): string[] {
  // -oj writes word-level JSON, -of chooses its path prefix.
  return ["-m", input.modelPath, "-f", input.filePath, "-oj", "-of", input.outputStem];
}

function isMissingBinary(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A transcription provider backed by a local whisper CLI.
 *
 * The binary and model are prerequisites the user installs: nothing is bundled
 * and no weights are downloaded. A missing binary is reported as
 * `not-configured` so the API answers 503, exactly as a missing API key does.
 */
export function createLocalWhisperProvider(config: LocalWhisperConfig): TranscriptionProvider {
  const binary = config.binary ?? "whisper-cli";
  const run: LocalRunner = config.run ?? nodeRun;
  const readOutput =
    config.readOutput ??
    (async (stem: string) => nodeFs.readFile(`${stem}.json`, "utf8"));
  const stemFor = config.stemFor ?? ((filePath: string) => `${filePath}.verbal`);

  return {
    id: "local-whisper",

    async transcribe(request, options) {
      const stem = stemFor(request.filePath);

      try {
        await run(
          binary,
          buildLocalArgs({
            modelPath: config.modelPath,
            filePath: request.filePath,
            outputStem: stem,
          }),
        );
      } catch (error) {
        if (isMissingBinary(error)) {
          throw new AiError("not-configured", `the ${binary} binary is not available`);
        }
        if (options?.signal?.aborted === true) {
          throw new AiError("request-failed", "transcription cancelled");
        }
        throw new AiError("request-failed", messageOf(error));
      }

      let raw: string;
      try {
        raw = await readOutput(stem);
      } catch (error) {
        throw new AiError("request-failed", `no whisper output was written: ${messageOf(error)}`);
      }

      return parseWhisperJson(raw);
    },
  };
}

const execFileAsync = promisify(execFile) as (
  file: string,
  argv: string[],
  options: { shell: boolean; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

const nodeRun: LocalRunner = (binary, args) =>
  execFileAsync(binary, [...args], { shell: false, maxBuffer: 16 * 1024 * 1024 });
