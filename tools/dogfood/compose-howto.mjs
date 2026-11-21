/**
 * Burn the recorded session's step captions into a how-to MP4.
 *
 * Usage:
 *   node tools/dogfood/compose-howto.mjs [session.json] [output.mp4]
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

function safe(text) {
  // drawtext treats these as syntax; the captions are plain sentences.
  return text.replace(/['"\\:;%]/g, (character) => (character === ";" ? "," : " ")).trim();
}

function filterFor(text, extra) {
  return `drawtext=fontfile=${FONT}:text='${safe(text)}':fontcolor=white:fontsize=26:x=28:y=h-76:box=1:boxcolor=0x101014@0.86:boxborderw=16:${extra}`;
}

const sessionPath = process.argv[2] ?? path.join(process.env.DOGFOOD_OUT ?? "/tmp/verbal-dogfood", "session.json");
const output = process.argv[3] ?? path.join(path.dirname(sessionPath), "howto.mp4");

const session = JSON.parse(await readFile(sessionPath, "utf8"));
const duration = Number(
  execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    session.video,
  ])
    .toString()
    .trim(),
);

const steps = session.steps ?? [];
if (steps.length === 0) {
  throw new Error("session has no steps");
}

const filters = [
  // Honest label, kept out of the app's top bar and caption band.
  `drawtext=fontfile=${FONT}:text='demo transcript is scripted':fontcolor=0x8a8a96:fontsize=12:x=w-tw-20:y=h-22:box=1:boxcolor=0x101014@0.6:boxborderw=6`,
];

steps.forEach((step, index) => {
  const from = step.at;
  const to = index + 1 < steps.length ? steps[index + 1].at : duration;
  if (to - from < 0.9) {
    return;
  }
  filters.push(filterFor(step.caption, `enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'`));
});

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i", session.video,
    "-vf", filters.join(","),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "22",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-an",
    output,
  ],
  { stdio: "inherit" },
);

console.log(`how-to: ${output} (${duration.toFixed(1)}s, ${steps.length} steps)`);
