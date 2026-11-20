import { runCommand, type CommandRunner } from "./exec";

/** Result of probing one external binary. */
export type ToolStatus = {
  available: boolean;
  /** First line of the tool's version output, when available. */
  version?: string;
  /** Human-readable failure reason, when unavailable. */
  error?: string;
};

export type SystemStatus = {
  ffmpeg: ToolStatus;
  ffprobe: ToolStatus;
};

async function probeTool(runner: CommandRunner, binary: string): Promise<ToolStatus> {
  try {
    const { stdout } = await runner(binary, ["-version"]);
    const firstLine = stdout.split("\n")[0]?.trim();

    return firstLine ? { available: true, version: firstLine } : { available: true };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Checks that FFmpeg and ffprobe are usable.
 *
 * Never throws: a missing binary is reported as an unavailable tool so the UI
 * can show actionable guidance instead of failing the request.
 */
export async function checkTools(runner: CommandRunner = runCommand): Promise<SystemStatus> {
  const [ffmpeg, ffprobe] = await Promise.all([
    probeTool(runner, "ffmpeg"),
    probeTool(runner, "ffprobe"),
  ]);

  return { ffmpeg, ffprobe };
}

/** Names of the tools that are not available, in display order. */
export function describeMissingTools(status: SystemStatus): string[] {
  const missing: string[] = [];

  if (!status.ffmpeg.available) {
    missing.push("ffmpeg");
  }
  if (!status.ffprobe.available) {
    missing.push("ffprobe");
  }

  return missing;
}
