/** Width of a generated library thumbnail, in pixels. */
export const THUMBNAIL_WIDTH = 320;

/**
 * Builds the argv for extracting a single thumbnail frame.
 *
 * Returns an argv array rather than a command string: paths are passed as
 * discrete arguments and are never interpreted by a shell.
 */
export function buildThumbnailArgs(input: string, output: string, atSeconds = 1): string[] {
  const seek = Number.isFinite(atSeconds) && atSeconds > 0 ? atSeconds : 0;

  return [
    "-y",
    "-ss",
    String(seek),
    "-i",
    input,
    "-frames:v",
    "1",
    "-vf",
    `scale=${THUMBNAIL_WIDTH}:-2`,
    output,
  ];
}
