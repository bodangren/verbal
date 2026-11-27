import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as nodeFs } from "node:fs";
import { dirname, basename, resolve } from "node:path";
import { publishAtomically } from "./publish";
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
  /** Absent means the output carries no video stream. */
  videoCodec?: string;
  /** Absent means the output carries no audio stream. */
  audioCodec?: string;
  videoArgs?: string[];
  audioArgs?: string[];
};

export const DEFAULT_EXPORT_CODECS: Required<ExportCodecOptions> = {
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
 *
 * The stream map follows the preset and the probed streams. A preset without
 * a video codec builds an audio graph and no video stream. A recipe that
 * needs audio but reads no audio stream gets a silent lavfi input.
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

  const requested = input.codecs;
  const codecs: ExportCodecOptions = { ...DEFAULT_EXPORT_CODECS, ...requested };
  const wantsVideo = requested === undefined || requested.videoCodec !== undefined;
  const wantsAudio = codecs.audioCodec !== undefined;

  if (!wantsVideo && !wantsAudio) {
    throw new ExportError(
      "invalid-option",
      "the export needs a video codec or an audio codec",
    );
  }

  const hasSilence = items.some((item) => item.kind === "silence");
  const geometry = input.video;
  if (hasSilence && wantsVideo) {
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

  // A silence piece is generated at the requested geometry while the source
  // frames are read at the same geometry (autorotated by ffmpeg). Normalise
  // every piece to one size, sample aspect ratio and frame rate before concat.
  const normaliseVideo = hasSilence && wantsVideo;

  const filters: string[] = [];
  const labels: string[] = [];

  items.forEach((item, index) => {
    if (wantsVideo) {
      if (item.kind === "video") {
        const size = geometry as ExportVideoGeometry;
        const normalise = normaliseVideo
          ? `,scale=${size.width}:${size.height},setsar=1,fps=${seconds(size.fps)}`
          : "";
        filters.push(
          `[0:v]trim=start=${seconds(item.startSeconds)}:end=${seconds(item.endSeconds)},setpts=PTS-STARTPTS${normalise}[v${index}]`,
        );
      } else {
        const size = geometry as ExportVideoGeometry;
        filters.push(
          `color=c=black:s=${size.width}x${size.height}:r=${seconds(size.fps)}:d=${seconds(item.durationSeconds)},setpts=PTS-STARTPTS,setsar=1[v${index}]`,
        );
      }
    }

    if (wantsAudio) {
      if (item.kind === "video") {
        if (input.hasAudio) {
          filters.push(
            `[0:a]atrim=start=${seconds(item.startSeconds)}:end=${seconds(item.endSeconds)},asetpts=PTS-STARTPTS[a${index}]`,
          );
        } else {
          filters.push(
            `[1:a]atrim=start=0.000000:end=${seconds(item.endSeconds - item.startSeconds)},asetpts=PTS-STARTPTS[a${index}]`,
          );
        }
      } else {
        filters.push(`anullsrc=r=48000:cl=stereo:d=${seconds(item.durationSeconds)}[a${index}]`);
      }
    }

    if (wantsVideo && wantsAudio) {
      labels.push(`[v${index}][a${index}]`);
    } else if (wantsVideo) {
      labels.push(`[v${index}]`);
    } else {
      labels.push(`[a${index}]`);
    }
  });

  const videoCount = wantsVideo ? 1 : 0;
  const audioCount = wantsAudio ? 1 : 0;
  const outputs = wantsVideo && wantsAudio ? "[vout][aout]" : wantsVideo ? "[vout]" : "[aout]";
  filters.push(
    `${labels.join("")}concat=n=${items.length}:v=${videoCount}:a=${audioCount}${outputs}`,
  );

  const args = ["-y", "-i", input.inputPath];

  const needsSilentInput =
    wantsAudio && !input.hasAudio && items.some((item) => item.kind === "video");
  if (needsSilentInput) {
    const totalSeconds = items.reduce(
      (total, item) =>
        total +
        (item.kind === "video" ? item.endSeconds - item.startSeconds : item.durationSeconds),
      0,
    );
    args.push("-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo:d=${seconds(totalSeconds)}`);
  }

  args.push("-filter_complex", filters.join(";"));

  if (wantsVideo) {
    args.push("-map", "[vout]");
  }
  if (wantsAudio) {
    args.push("-map", "[aout]");
  }

  if (wantsVideo) {
    args.push("-c:v", codecs.videoCodec ?? DEFAULT_EXPORT_CODECS.videoCodec);
    if (codecs.videoArgs !== undefined) {
      args.push(...codecs.videoArgs);
    }
  }

  if (wantsAudio) {
    args.push("-c:a", codecs.audioCodec ?? DEFAULT_EXPORT_CODECS.audioCodec);
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
    realpath(resolve(source)).catch(() => resolve(source)),
    realpath(resolve(destination)).catch(() =>
      realpath(dirname(resolve(destination)))
        .catch(() => dirname(resolve(destination)))
        .then((parent) => resolve(parent, basename(destination))),
    ),
  ]);
  const sameRealPath = sourceReal === destinationReal;
  const sameInode = await nodeFs
    .stat(resolve(source))
    .then(async (sourceStat) => {
      const destinationStat = await nodeFs.stat(resolve(destination)).catch(() => undefined);
      return (
        destinationStat !== undefined &&
        sourceStat.dev === destinationStat.dev &&
        sourceStat.ino === destinationStat.ino
      );
    })
    .catch(() => false);
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
  const expectedSeconds = resolveItems(input).reduce(
    (total, item) =>
      total + (item.kind === "video" ? item.endSeconds - item.startSeconds : item.durationSeconds),
    0,
  );

  const onProgress = input.onProgress ?? (() => undefined);
  const feed = createProgressParser(expectedSeconds, onProgress);
  const spawner = input.spawner ?? spawnProcess;

  await publishAtomically({
    outputPath: input.outputPath,
    jobId: input.jobId ?? randomUUID(),
    write: async (partialPath) => {
      const args = buildExportArgs({ ...input, outputPath: partialPath });
      await spawner("ffmpeg", args, {
        signal: input.signal,
        onStdout: feed,
      });
    },
    rename: input.rename,
    unlink: input.unlink,
  });
}
