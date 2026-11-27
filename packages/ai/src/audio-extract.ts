import { isMissingBinary, messageOf, type LocalRunner } from "./process";
import { AiError } from "./types";

/** Compact audio the cloud provider uploads: mono 16 kHz MP3. */
export const EXTRACT_SAMPLE_RATE = 16000;
export const EXTRACT_BITRATE_KBPS = 32;
export const EXTRACT_EXTENSION = "mp3";

/** The largest audio file sent in one upload; larger audio is split. */
export const DEFAULT_MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

export type ExtractRunOptions = {
  signal?: AbortSignal;
};

/** ffmpeg argv that extracts mono 16 kHz MP3 audio from any media file. */
export function buildExtractArgs(input: string, output: string): string[] {
  return [
    "-v",
    "error",
    "-y",
    "-i",
    input,
    "-vn",
    "-ar",
    String(EXTRACT_SAMPLE_RATE),
    "-ac",
    "1",
    "-c:a",
    "libmp3lame",
    "-b:a",
    `${EXTRACT_BITRATE_KBPS}k`,
    output,
  ];
}

/** ffmpeg argv that cuts one time slice of already-extracted audio. */
export function buildChunkArgs(
  input: string,
  output: string,
  startSeconds: number,
  durationSeconds: number,
): string[] {
  return [
    "-v",
    "error",
    "-y",
    "-ss",
    startSeconds.toFixed(3),
    "-t",
    durationSeconds.toFixed(3),
    "-i",
    input,
    "-vn",
    "-ar",
    String(EXTRACT_SAMPLE_RATE),
    "-ac",
    "1",
    "-c:a",
    "libmp3lame",
    "-b:a",
    `${EXTRACT_BITRATE_KBPS}k`,
    output,
  ];
}

/** Runs an ffmpeg extraction and maps failures to AiError codes. */
export async function runExtract(
  run: LocalRunner,
  args: readonly string[],
  options?: ExtractRunOptions,
): Promise<void> {
  try {
    await run("ffmpeg", args, { signal: options?.signal });
  } catch (error) {
    if (isMissingBinary(error)) {
      throw new AiError("not-configured", "the ffmpeg binary is not available");
    }
    if (options?.signal?.aborted === true) {
      throw new AiError("request-failed", "transcription cancelled");
    }
    throw new AiError("request-failed", messageOf(error));
  }
}

/** Seconds per chunk, sized so each re-encoded chunk stays under the limit. */
export function chunkLengthSeconds(maxUploadBytes: number, bitrateKbps: number): number {
  const bytesPerSecond = (bitrateKbps * 1000) / 8;
  return Math.max(1, Math.floor((maxUploadBytes / bytesPerSecond) * 0.9));
}

/** Start offset in seconds for each chunk of an extracted file. */
export function chunkStartsSeconds(
  totalBytes: number,
  maxUploadBytes: number,
  bitrateKbps: number,
): number[] {
  if (totalBytes <= maxUploadBytes) {
    return [0];
  }
  const length = chunkLengthSeconds(maxUploadBytes, bitrateKbps);
  const bytesPerSecond = (bitrateKbps * 1000) / 8;
  const totalSeconds = totalBytes / bytesPerSecond;
  const count = Math.max(1, Math.ceil(totalSeconds / length));
  return Array.from({ length: count }, (_, index) => index * length);
}
