import { spawn } from "node:child_process";
import { promises as nodeFs } from "node:fs";
import { AiError, type TranscriptionProvider, type TranscriptionResult } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonSpeechTag(text: string): boolean {
  return /^(?:\[[^\]]*\]|\([^)]*\))$/.test(text);
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
    if (text === "" || isNonSpeechTag(text)) {
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

const PROGRESS_PATTERN = /whisper_print_progress_callback:\s*progress\s*=\s*(\d{1,3})\s*%/g;

/**
 * Returns the last complete percentage in a stderr chunk, as a fraction.
 *
 * A line split before "%" yields null. The caller keeps the text so the next
 * chunk can complete it.
 */
export function parseWhisperProgress(chunk: string): number | null {
  let last: number | null = null;

  for (const match of chunk.matchAll(PROGRESS_PATTERN)) {
    const value = Number(match[1]);
    if (value >= 0 && value <= 100) {
      last = value / 100;
    }
  }

  return last;
}

/** Keeps the tail of stderr, so a split line can finish without growing memory. */
export function appendStderrTail(previous: string, chunk: string): string {
  return `${previous}${chunk}`.slice(-200);
}

/** Builds the failure message for a non-zero exit, with the CLI's own error. */
export function describeExit(binary: string, code: number | null, stderr: string): string {
  const short = `${binary} exited with code ${code}`;
  if (code === 0) {
    return short;
  }

  const tail = stderr
    .replace(/^whisper_print_progress_callback:.*$/gm, "")
    .slice(-500)
    .trim();

  return tail === "" ? short : `${short}: ${tail}`;
}

/** Options passed to an injected runner, so tests need no real child process. */
export type LocalRunOptions = {
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
};

/** Runs a command with an argv array; injected so tests need no binary. */
export type LocalRunner = (
  binary: string,
  args: readonly string[],
  options?: LocalRunOptions,
) => Promise<{ stdout: string; stderr: string }>;

export type LocalWhisperConfig = {
  /** Path to the model file the CLI loads. */
  modelPath: string;
  binary?: string;
  language?: string;
  run?: LocalRunner;
  /** Reads the JSON the CLI wrote for a given output stem. */
  readOutput?: (stem: string) => Promise<string>;
  /** Where the CLI should write its JSON, given the media path. */
  stemFor?: (filePath: string) => string;
  /** Removes the extracted WAV after transcription. */
  removeFile?: (path: string) => Promise<void>;
};

/** The CLI invocation, as an argv array; no value is ever shell-interpolated. */
export function buildLocalArgs(input: {
  modelPath: string;
  filePath: string;
  outputStem: string;
  language?: string;
}): string[] {
  // -oj writes JSON; -ml 1 and -sow split it into words; -l sets the language.
  // -pp prints progress on stderr; -of chooses the output path prefix.
  return [
    "-m",
    input.modelPath,
    "-f",
    input.filePath,
    "-l",
    input.language ?? "auto",
    "-oj",
    "-ml",
    "1",
    "-sow",
    "-pp",
    "-of",
    input.outputStem,
  ];
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
  const removeFile = config.removeFile ?? ((path: string) => nodeFs.rm(path, { force: true }));

  return {
    id: "local-whisper",

    async transcribe(request, options) {
      const stem = stemFor(request.filePath);
      const wavPath = `${stem}.wav`;
      let lastPercent = -1;

      const report = (fraction: number, force = false): void => {
        const value = Number(Math.min(1, Math.max(0, fraction)).toFixed(4));
        const percent = Math.round(value * 100);
        if (!force && percent <= lastPercent) {
          return;
        }
        lastPercent = percent;
        options?.onProgress?.(value);
      };

      try {
        try {
          await run("ffmpeg", [
            "-v",
            "error",
            "-y",
            "-i",
            request.filePath,
            "-vn",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            wavPath,
          ], { signal: options?.signal });
        } catch (error) {
          if (isMissingBinary(error)) {
            throw new AiError("not-configured", "the ffmpeg binary is not available");
          }
          if (options?.signal?.aborted === true) {
            throw new AiError("request-failed", "transcription cancelled");
          }
          throw new AiError("request-failed", messageOf(error));
        }

        report(0.05, true);

        let stderrSeen = "";
        try {
          await run(
            binary,
            buildLocalArgs({
              modelPath: config.modelPath,
              filePath: wavPath,
              outputStem: stem,
              language: config.language,
            }),
            {
              signal: options?.signal,
              onStderr: (chunk) => {
                stderrSeen = appendStderrTail(stderrSeen, chunk);
                const fraction = parseWhisperProgress(stderrSeen);
                if (fraction !== null) {
                  report(0.05 + fraction * 0.9);
                }
              },
            },
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

        const result = parseWhisperJson(raw);
        report(1);
        return result;
      } finally {
        await removeFile(wavPath).catch(() => {});
      }
    },
  };
}

const nodeRun: LocalRunner = (binary, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], { shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const abort = () => child.kill("SIGTERM");
    if (options?.signal?.aborted === true) {
      abort();
    } else {
      options?.signal?.addEventListener("abort", abort, { once: true });
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
      options?.onStderr?.(chunk);
    });

    child.on("error", (error) => {
      options?.signal?.removeEventListener("abort", abort);
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });
    child.on("close", (code) => {
      options?.signal?.removeEventListener("abort", abort);
      if (settled) {
        return;
      }
      settled = true;
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(describeExit(binary, code, stderr)));
      }
    });
  });
