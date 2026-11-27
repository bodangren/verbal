import { isMissingBinary, messageOf, type LocalRunner } from "./process";
import { AiError } from "./types";

/** Compact audio the cloud provider uploads: mono 16 kHz MP3. */
export const EXTRACT_SAMPLE_RATE = 16000;
export const EXTRACT_BITRATE_KBPS = 32;
export const EXTRACT_EXTENSION = "mp3";

/** The largest audio file sent in one upload; larger audio is split. */
export const DEFAULT_MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

/** How many times a chunk may be re-split before the upload fails. */
export const MAX_SPLIT_ROUNDS = 3;

export type ExtractRunOptions = {
  signal?: AbortSignal;
};

/** One time slice of an extracted audio track. */
export type ChunkSegment = {
  startSeconds: number;
  durationSeconds: number;
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

/** ffprobe argv that prints the format duration as a bare number. */
export function buildProbeArgs(file: string): string[] {
  return [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    file,
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

/** Measures the extracted audio duration in seconds with ffprobe. */
export async function probeDurationSeconds(
  run: LocalRunner,
  file: string,
  options?: ExtractRunOptions,
): Promise<number> {
  let stdout: string;
  try {
    const result = await run("ffprobe", buildProbeArgs(file), { signal: options?.signal });
    stdout = result.stdout;
  } catch (error) {
    if (isMissingBinary(error)) {
      throw new AiError("not-configured", "the ffprobe binary is not available");
    }
    if (options?.signal?.aborted === true) {
      throw new AiError("request-failed", "transcription cancelled");
    }
    throw new AiError("request-failed", messageOf(error));
  }

  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new AiError("request-failed", "ffprobe returned no audio duration");
  }
  return seconds;
}

/** Seconds per chunk, sized so each re-encoded chunk stays under the limit. */
export function chunkLengthSeconds(maxUploadBytes: number, bitrateKbps: number): number {
  const bytesPerSecond = (bitrateKbps * 1000) / 8;
  return Math.max(1, Math.floor((maxUploadBytes / bytesPerSecond) * 0.9));
}

/** Time slices of an audio track, planned from its real duration. */
export function planChunks(
  totalSeconds: number,
  maxUploadBytes: number,
  bitrateKbps: number,
): ChunkSegment[] {
  if (!(totalSeconds > 0)) {
    return [{ startSeconds: 0, durationSeconds: 1 }];
  }
  const length = chunkLengthSeconds(maxUploadBytes, bitrateKbps);
  if (totalSeconds <= length) {
    return [{ startSeconds: 0, durationSeconds: totalSeconds }];
  }
  const count = Math.ceil(totalSeconds / length);
  return Array.from({ length: count }, (_, index) => {
    const startSeconds = index * length;
    return {
      startSeconds,
      durationSeconds: Math.min(length, totalSeconds - startSeconds),
    };
  });
}
