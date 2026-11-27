import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as nodeFs } from "node:fs";
import { dirname, basename, extname, resolve } from "node:path";
import type { CutRange } from "./cutlist";
import type { TimelineItem } from "./timeline";

export type ExportErrorCode =
  | "empty-cut-list"
  | "invalid-option"
  | "cancelled"
  | "output-failed";

/** Error raised when an export cannot be planned or completed. */
export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = "ExportError";
    this.code = code;
  }
}

export type ExportCodecOptions = {
  videoCodec: string;
  audioCodec: string;
  videoArgs?: string[];
  audioArgs?: string[];
};

export const DEFAULT_EXPORT_CODECS: ExportCodecOptions = {
  videoCodec: "libx264",
  audioCodec: "aac",
  videoArgs: ["-crf", "20", "-preset", "veryfast"],
  audioArgs: ["-b:a", "192k"],
};

export type ExportVideoGeometry = {
  width: number;
  height: number;
  fps: number;
};

export type BuildExportArgsInput = {
  inputPath: string;
  outputPath: string;
  /** Legacy: kept source-video ranges, in order. */
  kept?: readonly CutRange[];
  /** Ordered source pieces and inserted silences. */
  items?: readonly TimelineItem[];
  hasAudio: boolean;
  codecs?: Partial<ExportCodecOptions>;
  /** Source video size and rate; needed to size black silence segments. */
  video?: ExportVideoGeometry;
};

/** Fixed-precision seconds; avoids locale and exponent formatting in filtergraphs. */
function seconds(value: number): string {
  return value.toFixed(6);
}

/** Normalises the legacy `kept` field and the new `items` field into one list. */
function resolveItems(input: BuildExportArgsInput): TimelineItem[] {
  if (input.items !== undefined) {
    return [...input.items];
  }
  if (input.kept !== undefined) {
    return input.kept.map((range) => ({
      kind: "video",
      startSeconds: range.start,
      endSeconds: range.end,
    }));
  }
  return [];
}

/**
 * Builds the ffmpeg argv for a cut-list export.
 *
 * Each source piece is trimmed and time-shifted to zero, and an inserted
 * silence is rendered as black video plus silent audio from lavfi sources.
 * The pieces are then concatenated in one filter graph. This always
 * re-encodes: it is exact, and stream-copy can only cut on keyframes.
 */
export function buildExportArgs(input: BuildExportArgsInput): string[] {
  const items = resolveItems(input);

  if (items.length === 0) {
    throw new ExportError("empty-cut-list", "cannot export an empty cut list");
  }

  for (const item of items) {
    if (item.kind === "video") {
      if (
        !Number.isFinite(item.startSeconds) ||
        !Number.isFinite(item.endSeconds) ||
        item.endSeconds <= item.startSeconds
      ) {
        throw new ExportError("invalid-option", "every video range must be finite and non-empty");
      }
    } else if (!Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0) {
      throw new ExportError("invalid-option", "every silence must have a positive duration");
    }
  }

  const hasSilence = items.some((item) => item.kind === "silence");
  const geometry = input.video;
  if (hasSilence) {
    if (
      geometry === undefined ||
      !Number.isFinite(geometry.width) ||
      geometry.width < 2 ||
      !Number.isFinite(geometry.height) ||
      geometry.height < 2 ||
      !Number.isFinite(geometry.fps) ||
      geometry.fps <= 0
    ) {
      throw new ExportError(
        "invalid-option",
        "silence needs the source video size and rate",
      );
    }
  }

  const codecs: ExportCodecOptions = { ...DEFAULT_EXPORT_CODECS, ...input.codecs };

  const filters: string[] = [];
  const labels: string[] = [];

  items.forEach((item, index) => {
    if (item.kind === "video") {
      filters.push(
        `[0:v]trim=start=${seconds(item.startSeconds)}:end=${seconds(item.endSeconds)},setpts=PTS-STARTPTS[v${index}]`,
      );

      if (input.hasAudio) {
        filters.push(
          `[0:a]atrim=start=${seconds(item.startSeconds)}:end=${seconds(item.endSeconds)},asetpts=PTS-STARTPTS[a${index}]`,
        );
        labels.push(`[v${index}][a${index}]`);
      } else {
        labels.push(`[v${index}]`);
      }
    } else {
      const size = geometry as ExportVideoGeometry;
      filters.push(
        `color=c=black:s=${size.width}x${size.height}:r=${seconds(size.fps)}:d=${seconds(item.durationSeconds)},setpts=PTS-STARTPTS[v${index}]`,
      );

      if (input.hasAudio) {
        filters.push(`anullsrc=r=48000:cl=stereo:d=${seconds(item.durationSeconds)}[a${index}]`);
        labels.push(`[v${index}][a${index}]`);
      } else {
        labels.push(`[v${index}]`);
      }
    }
  });

  const audioCount = input.hasAudio ? 1 : 0;
  const concat = `${labels.join("")}concat=n=${items.length}:v=1:a=${audioCount}[vout]`;
  filters.push(input.hasAudio ? `${concat}[aout]` : concat);

  const args = [
    "-y",
    "-i",
    input.inputPath,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
  ];

  if (input.hasAudio) {
    args.push("-map", "[aout]");
  }

  args.push("-c:v", codecs.videoCodec);
  if (codecs.videoArgs !== undefined) {
    args.push(...codecs.videoArgs);
  }

  if (input.hasAudio) {
    args.push("-c:a", codecs.audioCodec);
    if (codecs.audioArgs !== undefined) {
      args.push(...codecs.audioArgs);
    }
  }

  args.push("-progress", "pipe:1", "-nostats", input.outputPath);

  return args;
}

export type ExportProgress = {
  /** Fraction of the expected output duration, clamped to 0..1. */
  percent: number;
  seconds: number;
};

/**
 * Builds a chunk parser for ffmpeg's `-progress pipe:1` output.
 *
 * ffmpeg may split a line across writes, so incomplete trailing text is
 * buffered until the next chunk.
 */
export function createProgressParser(
  totalSeconds: number,
  onProgress: (progress: ExportProgress) => void,
): (chunk: string) => void {
  let buffer = "";

  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("out_time_ms=")) {
        const microseconds = Number(trimmed.slice("out_time_ms=".length));
        if (Number.isFinite(microseconds) && microseconds >= 0) {
          const elapsed = microseconds / 1_000_000;
          const percent = totalSeconds > 0 ? Math.min(1, elapsed / totalSeconds) : 0;
          onProgress({ percent, seconds: elapsed });
        }
      } else if (trimmed === "progress=end") {
        onProgress({ percent: 1, seconds: totalSeconds });
      }
    }
  };
}

export type SpawnOptions = {
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

/** Runs a process to completion, supporting cancellation and streamed output. */
export type Spawner = (
  file: string,
  args: readonly string[],
  options: SpawnOptions,
) => Promise<void>;

/** Default spawner: no shell, stdout streamed for progress, SIGKILL on abort. */
export const spawnProcess: Spawner = (file, args, options) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(file, [...args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    const onAbort = () => {
      child.kill("SIGKILL");
    };

    if (options.signal !== undefined) {
      if (options.signal.aborted) {
        child.kill("SIGKILL");
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      options.onStdout?.(chunk.toString());
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderr?.(text);
    });

    child.on("error", (error) => {
      options.signal?.removeEventListener("abort", onAbort);
      reject(error);
    });

    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", onAbort);

      if (options.signal?.aborted === true) {
        reject(new ExportError("cancelled", "export cancelled"));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new ExportError(
          "output-failed",
          `ffmpeg exited with code ${String(code)}: ${stderr.trim()}`,
        ),
      );
    });
  });

export type RunExportInput = BuildExportArgsInput & {
  jobId?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
  spawner?: Spawner;
  unlink?: (path: string) => Promise<void>;
  rename?: (from: string, to: string) => Promise<void>;
};

export type Realpath = (path: string) => Promise<string>;

export async function resolveExportDestination(
  source: string,
  destination: string,
  realpath: Realpath = nodeFs.realpath,
): Promise<string> {
  const [sourceReal, destinationReal] = await Promise.all([
    realpath(resolve(source)),
    realpath(resolve(destination)).catch(() =>
      realpath(dirname(resolve(destination))).then((parent) =>
        resolve(parent, basename(destination)),
      ),
    ),
  ]);
  const sameRealPath = sourceReal === destinationReal;
  const sameInode = await nodeFs.stat(resolve(source)).then(async (sourceStat) => {
    const destinationStat = await nodeFs.stat(resolve(destination)).catch(() => undefined);
    return destinationStat !== undefined &&
      sourceStat.dev === destinationStat.dev &&
      sourceStat.ino === destinationStat.ino;
  });
  if (sameRealPath || sameInode) {
    throw new ExportError("invalid-option", "outputPath must not be the source video");
  }
  return destination;
}

/**
 * Runs an export, reporting progress and removing a partial file on failure.
 *
 * A failed or cancelled export must not leave a half-written file that looks
 * like a finished one.
 */
export async function runExport(input: RunExportInput): Promise<void> {
  const extension = extname(input.outputPath);
  const stem = extension === "" ? input.outputPath : input.outputPath.slice(0, -extension.length);
  const partialPath = `${stem}.${input.jobId ?? randomUUID()}.partial${extension}`;
  const args = buildExportArgs({ ...input, outputPath: partialPath });
  const expectedSeconds = resolveItems(input).reduce(
    (total, item) =>
      total + (item.kind === "video" ? item.endSeconds - item.startSeconds : item.durationSeconds),
    0,
  );

  const onProgress = input.onProgress ?? (() => undefined);
  const feed = createProgressParser(expectedSeconds, onProgress);
  const spawner = input.spawner ?? spawnProcess;
  const rename = input.rename ?? (async (from: string, to: string) => nodeFs.rename(from, to));
  const unlink =
    input.unlink ??
    (async (path: string) => {
      await nodeFs.unlink(path);
    });

  try {
    await spawner("ffmpeg", args, {
      signal: input.signal,
      onStdout: feed,
    });
    await rename(partialPath, input.outputPath);
  } catch (error) {
    await unlink(partialPath).catch(() => undefined);
    throw error;
  }
}
