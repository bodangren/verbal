import { AiError, type TranscriptionResult } from "./types";

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
